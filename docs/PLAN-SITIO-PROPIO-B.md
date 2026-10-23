# Plan B — Sitio propio con el diseño de la maqueta y Tiendanube detrás

Fecha: 22/10/2026 · Estado: **propuesta para probar en DEV**. Tienda de pruebas: **demo de Partners 8415696** (la vieja tienda "x" 8413613 quedó fuera de todo desde el 22/10/2026). Nada de esto toca producción, GitHub, la tienda real (6357775) ni la base del ERP de producción.

## Idea

El cliente ve **la maqueta de Netlify tal cual**. Por detrás:

```
Cliente ──> Sitio propio (maqueta) ──> Servidor chico (Cloudflare Worker) ──> API de Tiendanube ──> ERP
              catálogo, carrito,          guarda la clave, valida y            pedido "abierto,     importa como hoy
              checkout, Mis pedidos        arma el pedido                       pago pendiente"
```

Tiendanube sigue siendo el lugar donde viven productos, clientes y pedidos. El ERP no cambia: ya importa todo pedido abierto y sin preparar (`app/api/tiendanube/route.ts`, `status=open` + `shipping_status=unpacked`), sin mirar cómo se creó.

## Qué verifiqué (documentación oficial de la API)

| Necesidad | ¿Se puede? | Cómo |
|---|---|---|
| Leer catálogo, precios, variantes, fotos | Sí | `GET /products` (permiso `read_products`) |
| Crear el pedido "a confirmar" | **Sí** | `POST /orders` con `gateway: "offline"` o `"not-provided"`, `payment_status: "pending"` (por defecto), `products[{variant_id, quantity}]`, `customer{name, email, phone}`, `shipping_pickup_type: "pickup"` o `"ship"`, `inventory_behaviour: "bypass"` (no reserva stock: lo confirma el local), `send_confirmation_email` opcional |
| Precio | Se toma del producto en Tiendanube si no se manda: el sitio **no** decide precios |
| Crear o actualizar el cliente | Sí | `POST /customers` / `PUT /customers/{id}` con direcciones |
| Login del cliente contra Tiendanube | **No existe** | No hay endpoint para validar contraseña ni SSO. El login lo tiene que resolver el sitio propio |
| Mostrar el avance en "Mis pedidos" | Sí, y mejor que la plantilla | El servidor lee el pedido (estado de preparación y envío que manda el ERP) **y también la nota interna** (`owner_note`), así que "Cotización enviada" y "Confirmado" se pueden mostrar, cosa que Ipanema/Rio no hacen |
| Marcar pagado | No por API (igual que hoy) | Se marca en el panel o lo maneja el ERP |

Fuentes: documentación de la API de Tiendanube, recursos [Order](https://tiendanube.github.io/api-documentation/resources/order) y [Customer](https://tiendanube.github.io/api-documentation/resources/customer).

## Decisiones de diseño propuestas

1. **El servidor manda, no el navegador.** El sitio solo envía "variante y cantidad". El servidor vuelve a leer precios de Tiendanube, recalcula el total, exige el mínimo de $50.000 y arma el pedido. Nadie puede cambiar un precio desde el navegador.
2. **Costos:** a pedido del dueño el catálogo DEV los incluye (`INCLUIR_COSTOS=1`). Es una sola variable: antes de abrir el sitio al público hay que decidir si se apaga, porque cualquiera que abra el catálogo en el navegador los vería. El pedido nunca lleva costos.
3. **(Decidido: sin cuentas en la primera versión; link privado de seguimiento.)** Login sin contraseñas, para más adelante: código de 6 dígitos por e-mail (o WhatsApp más adelante). No guardamos contraseñas. Retiro en el local: sin cuenta, solo nombre y teléfono (como dice la maqueta). Envío: requiere cuenta con dirección.
4. **La clave de Tiendanube vive solo en el servidor** (secreto de Cloudflare), con lista de tiendas permitidas: en DEV solo la tienda de prueba.
5. **Protección del formulario:** límite de pedidos por IP/teléfono, Cloudflare Turnstile (anti-bots, invisible) y validación de todos los campos.
6. **Mismo stack que el ERP** (Cloudflare Workers + D1) para no sumar tecnologías.

## Plan de prueba en DEV, por etapas

| Etapa | Qué se hace | Quién | Listo cuando |
|---|---|---|---|
| **0. Decisiones** | Confirmar: login por e-mail, retiro sin cuenta, si Tiendanube manda su e-mail de confirmación o solo WhatsApp | Vos | Respondidas |
| **1. App de prueba** | En Partners, agregar a la app 48162 los permisos `read_products`, `write_orders`, `read_customers`, `write_customers` e instalarla en la tienda de prueba **8413613** (tiene productos y ERP de prueba conectado) | Vos autorizás; yo guío | Token guardado (yo nunca lo veo) |
| **2. Prueba de concepto** | Script local que crea **un** pedido por API en la tienda de prueba y verificar que el ERP de prueba lo importa como pedido web (modo, teléfono, productos, total) | Yo | El pedido aparece en el ERP de prueba con los mismos datos que uno hecho desde la web |
| **3. Servidor DEV** | Worker con `GET /catalogo` (sin costos, con fotos y unidades) y `POST /pedido` (validaciones del punto 1 y 5) | Yo | Pruebas automáticas pasando |
| **4. Maqueta conectada** | La maqueta de Netlify deja de usar los datos fijos y usa el catálogo real; el checkout envía el pedido real a la tienda de prueba | Yo | Pedido de punta a punta: maqueta → Tiendanube de prueba → ERP de prueba |
| **5. Cuentas y Mis pedidos** | Login por código, direcciones, "Mis pedidos" con la línea de avance alimentada por los avisos del ERP (hoy en simulación) | Yo | Recorrido completo de un pedido visible para el cliente |
| **6. Revisión** | Seguridad (datos personales, abuso, errores), celular, velocidad, SEO (páginas de producto indexables) | Yo + revisión tuya | Informe sin pendientes graves |
| **7. Decisión de producción** | Dominio, qué pasa con la tienda Tiendanube visible (se mantiene como respaldo u oculta), fecha | Vos | Autorización explícita |

La etapa 2 es la que confirma o descarta el plan B en un día de trabajo, antes de invertir en lo demás.

**Etapa 2 — resultado (22/10/2026): OK.** Pedido #101 (id 2101109527) creado por API en la tienda de prueba 8413613: abierto, pago pendiente, total $51.512. Pasado por la normalización real del ERP (`erp-prueba/scripts-local/etapa2-pedido-api.mjs`): Retiro en depósito · Cotización pendiente · con teléfono · 3 SKU con precios correctos. Hallazgo: el pedido web de referencia (#100) llega al ERP sin teléfono; el sitio propio lo hará obligatorio. Decisión tomada: arrancar **sin cuentas** (datos en cada pedido, "Mis pedidos" por link privado).

## Ventajas y costos

- **A favor:** diseño exacto de la maqueta; "Mis pedidos" más completo que cualquier plantilla; el ERP y el circuito ERP→Tiendanube no cambian; se puede volver atrás (la tienda Tiendanube sigue funcionando).
- **En contra:** hay que mantener el sitio y el servidor; el login y la protección de datos pasan a ser responsabilidad propia; hay que resolver SEO (generar páginas de producto); el plan de Tiendanube se sigue pagando.
- **Plan A como respaldo:** el borrador "Rediseño piloto" en la tienda DEV queda listo por si se decide no seguir con B.

## Riesgos a vigilar

- Que un cambio en la API de Tiendanube rompa la creación de pedidos (mitigación: pruebas automáticas y alerta si falla; el cliente siempre puede pedir por WhatsApp).
- Que el ERP dependa de algún dato que solo trae el checkout de Tiendanube (lo detecta la etapa 2).
- Pedidos falsos o abuso del formulario (mitigación: punto 5 y el pedido igual queda a confirmar).


**Etapa 3 — resultado (22/10/2026): OK.** `sitio-api/` (Cloudflare Worker, solo local): `GET /catalogo`, `POST /pedido`, `GET /pedido/:id?t=`. 9 pruebas automáticas pasando (sin red). Contra la tienda de prueba: 509 productos en ~2,5 s, 506 con costo, rubros iguales a la maqueta, sin fotos (la tienda de prueba no tiene). Corregido en el camino: normalización de teléfonos que confundía "3-41-5" con un "15". Próximo: etapa 4, conectar la maqueta.

**Etapa 4 — resultado (22/10/2026): OK.** Todo pasó a la **tienda demo de Partners 8415696** (la tienda "x" vence). `sitio-maqueta/` (maqueta + `sitio-b.js`) servida en localhost:8787 contra `sitio-api` en localhost:8788 (wrangler local). Recorrido real en el navegador: catálogo real con fotos → carrito $74.767 → checkout propio sin cuentas (retiro, transferencia, nota) → **pedido #100 creado en la tienda demo** → página de seguimiento por link privado. El ERP (normalización real) lo lee como Retiro en depósito · Cotización pendiente · con teléfono y 3 SKU. Error encontrado y corregido en la prueba: `fetch` llamado como método en Workers ("Illegal invocation").

Incidente: la app 48162 se instaló por error en la tienda real al usar "Instalar aplicación" desde el Chrome normal; el script no guardó la clave y la app se desinstaló de la real el mismo día. Regla: instalar/autorizar apps solo en incógnito logueado en la tienda DEV.

**Etapa 5 — resultado (22/10/2026): OK.** ERP de prueba en **prueba local aislada** (`erp-prueba`, `.codex-tmp/review-preview`: base local con datos de ejemplo, sin cuenta de Cloudflare, sin WhatsApp), con los avisos a Tiendanube en modo `live` solo para la tienda demo 8415696 (la real y la vieja "x" bloqueadas en el código). App 48162 con `write_fulfillment_orders`.
- Pedido #100 (retiro): cotización enviada → confirmado → en preparación → listo para retirar → cobrado + entregado. Cada paso llegó a Tiendanube (notas internas, IN_PREPARATION, READY_FOR_PICKUP, DELIVERED + cierre) y el seguimiento del sitio avanzó: En revisión → Confirmado → En preparación → Listo para retirar → Entregado.
- Pedido #101: confirmado → cobro registrado (nota "Cobro registrado": el sitio muestra **Pagado**, resolviendo el límite de la API) → cancelado (POST /cancel; el cliente ve Cancelado).
- Cambios: el seguimiento del sitio lee la orden de preparación (fulfillment); nuevo aviso `paid_note`. Pruebas: 11 (ERP) + 9 (sitio).
- Pendientes: en un pedido cobrado y cancelado mostrar "reintegro"; la tabla `tiendanube_status_push` de bases viejas (ERP DEV unificado) necesita migración por el CHECK de estados nuevo; probar un envío (PACKED → DISPATCHED → evento delivered) con un pedido de envío.

**Envío probado (23/10/2026):** pedido #104 (envío en Rosario) desde el sitio → ERP de prueba con el panel de pruebas: confirmado → escaneado → BOX (PACKED) → cobrado → repartidor ALAN → en reparto (DISPATCHED) → entregado (evento `delivered` + cierre). Hallazgo corregido: el evento `delivered` exige `description` y `address` (la documentación no lo marcaba). El cliente vio Entregado · Pagado.

**Cancelaciones (23/10/2026), probado en DEV:**
- Cliente, antes de que se prepare (pedido #108): botón de arrepentimiento en el seguimiento → se cancela en Tiendanube → el ERP lo cancela solo al revisar la web.
- Cliente, ya preparado o en reparto (#109): el botón solo registra el pedido (nota "WEB · Pedido de cancelación del cliente") → el ERP crea la tarea urgente "Pedido de cancelación web" y marca el pedido; no se cancela solo.
- Interna en reparto (#110): el encargado cancela con PIN → tarea "Cancelación interna en reparto" (bloquea la entrega con mensaje claro, marca "volver al local", la web muestra "Cancelación en curso") → al volver la mercadería, completar con "Devolver" → cancelado, stock a reponer, cancelación en Tiendanube y el cliente ve "Cancelado · Devolución en curso".
- Si el pedido ya estaba cancelado en la web, el ERP no vuelve a cancelarlo en Tiendanube.
- Pendiente legal: confirmar con contador/abogado el alcance del botón de arrepentimiento (Res. 424/2020), incluido después de la entrega.
