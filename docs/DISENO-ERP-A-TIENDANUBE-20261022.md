# Diseño: el ERP le avisa a Tiendanube el estado de cada pedido web — 22/10/2026

Estado: **propuesta**. No hay código cambiado. Probar solo en DEV y con la tienda demo de Partners (8415696), nunca con la tienda real (6357775).

## Objetivo

Que el cliente vea en la web (página de seguimiento de Tiendanube, e-mails automáticos y "Mis pedidos" del rediseño) en qué etapa está su pedido, usando como fuente el estado que ya maneja el ERP en `order_workflow`.

## Situación actual

- La integración es **de solo lectura**: `app/api/tiendanube/http.ts` y `route.ts` rechazan todo método que no sea GET. Importa pedidos, productos, clientes y cancelaciones.
- Los pedidos web entran como cotización (`order_workflow.commercial_status='quote_sent'`, `quote_sent_at=''` → "Cotización pendiente").
- El ERP ya avisa por WhatsApp cuando un pedido está listo para retirar (`pickup_ready_whatsapp`, con cola, triggers y reintentos).
- Reglas que se mantienen (`BUSINESS_RULES.md`): confirmar no exige pago; la salida exige cobro registrado o cuenta corriente autorizada; nunca inferir una cancelación de una ausencia o un error.

## Qué permite la API de Tiendanube (documentación oficial)

| Acción | Endpoint | Permiso | Visible para el cliente |
|---|---|---|---|
| Nota interna del pedido | `PUT /orders/{id}` con `owner_note` | `write_orders` | No en la página de Tiendanube. En la plantilla: **a verificar** en el código de Rio |
| Cerrar / reabrir | `POST /orders/{id}/close` · `/open` | `write_orders` | Indirecto |
| Cancelar | `POST /orders/{id}/cancel` (`reason`: customer, inventory, fraud, other; `email`; `restock`) | `write_orders` | Sí, con e-mail opcional |
| Preparación y entrega | `PATCH /orders/{id}/fulfillment-orders/{fo_id}` con `status`: UNPACKED, IN_PREPARATION, PACKED, DISPATCHED, READY_FOR_PICKUP, DELIVERED | `write_fulfillment_orders` | Sí |
| Entregado | Evento de seguimiento `delivered` (recomendado por la doc en lugar de PATCH DELIVERED) | `write_fulfillment_orders` | Sí |
| Marcar pagado | **No disponible**: "There is no action to pay an order"; las transacciones son "for the exclusive use of payment apps" | — | — |

Restricciones de la API de preparación: `READY_FOR_PICKUP` no vale para envíos, `DISPATCHED` no vale para retiro no despachable, y no se permite volver atrás (salvo `IN_PREPARATION → UNPACKED` y `PACKED → UNPACKED`).

## Mapeo ERP → Tiendanube

| Evento en el ERP | Estado ERP | Qué se manda a Tiendanube | Qué ve el cliente |
|---|---|---|---|
| Importación | Cotización pendiente | Nada | "En espera de pago" |
| Se envía la cotización | Cotización enviada | `owner_note`: "ERP: cotización enviada $X" (interno) | WhatsApp con el total (como hoy) |
| El cliente confirma | Confirmado | `owner_note`: "ERP: confirmado" (interno) | WhatsApp (como hoy) |
| Empieza la preparación (`order_sessions` in_progress) | En preparación | Preparación `IN_PREPARATION` | "En preparación" |
| Preparación terminada + BOX | Listo | Retiro: `READY_FOR_PICKUP` · Envío: `PACKED` | "Listo para retirar" / "Empaquetado" |
| Sale a reparto (`delivery_status='in_transit'`) | En reparto | `DISPATCHED` | "Enviado" |
| Entregado (`deliveries` o `delivered`) | Entregado | Evento `delivered` y `POST /close` | "Entregado" |
| Cobro registrado | (pago) | **No se puede por API.** Alguien lo marca pagado en el panel de Tiendanube | "Pago recibido" |
| Cancelado o rechazado | Cancelado | `POST /cancel`, `reason=inventory` o `customer`, `restock=false` (el stock lo maneja el ERP) | "Cancelado" + e-mail |

Consecuencia para el rediseño: la línea de avance de "Mis pedidos" es **Recibido → En revisión → En preparación → Listo / En camino → Entregado**, con el pago como etiqueta aparte. "Cotización enviada" y "Confirmado" solo se pueden mostrar si la plantilla Rio puede leer la nota interna; si no, siguen por WhatsApp.

## Diseño técnico propuesto

1. **Cola saliente** `tiendanube_status_push`, con el mismo patrón que `pickup_ready_whatsapp`:
   `order_id, platform_id, target_status, payload, status (pending|sending|sent|failed|blocked), attempts, next_attempt_at, lease_until, last_error, created_at, updated_at`, con clave única `(order_id, target_status)` para no repetir envíos.
2. **Triggers** en `order_workflow`, `order_sessions`, `box_assignments` y `deliveries` que encolan el estado nuevo **en la misma transacción** del cambio. Solo para pedidos con `lower(source) LIKE '%tiendanube%'`.
3. **Envío por cron** (el `*/5` existente): toma pendientes con lease, llama a la API, guarda resultado. Reintentos con espera creciente ante 429/5xx; `failed` visible para el encargado tras N intentos. Nunca reintenta una transición que Tiendanube rechazó por ser hacia atrás: la marca `blocked`.
4. **Orden y consistencia**: antes de mandar, lee el estado actual del fulfillment en Tiendanube y salta pasos ya hechos; nunca manda un estado anterior al vigente.
5. **Llave de seguridad**: variable `TIENDANUBE_WRITE_ENABLED` (apagada por defecto) y lista de tiendas permitidas `TIENDANUBE_WRITE_STORES`. En DEV solo `8415696` (tienda demo de Partners). La regla actual "solo GET" se mantiene para todo lo demás; las escrituras pasan por una función aparte, con su propia lista de endpoints permitidos.
6. **Modo simulación**: con `TIENDANUBE_WRITE_DRY_RUN=1` la cola se llena y se registra qué se enviaría, sin llamar a la API.
7. **Permisos de la app**: además de los de lectura, `write_orders` y `write_fulfillment_orders`. Requiere reinstalar la app (nuevo token).

## Plan de prueba en DEV

1. Instalar en la tienda de prueba una app con los permisos nuevos (app de Partners 48162, ya con `write_orders`, instalada en la demo 8415696).
2. Activar modo simulación y recorrer un pedido completo en el ERP DEV: revisar la cola.
3. Activar escritura solo para 8415696 y repetir: verificar en el panel y en la página de seguimiento de la tienda de prueba cada estado, los e-mails y la cancelación.
4. Casos borde: pedido cancelado durante reparto, reimportación, cambio de modo retiro ↔ envío, errores 429/5xx, transición rechazada.

## Pendientes a decidir

- Si se usa la nota interna y si la plantilla Rio puede mostrarla (revisar por FTP).
- Quién marca "pagado" en Tiendanube y cuándo (la API no lo permite).
- Si Tiendanube manda e-mails automáticos en cada cambio de preparación o solo con `notify_customer`; probar en la tienda de prueba.
- Textos de los e-mails de Tiendanube para cada estado.
