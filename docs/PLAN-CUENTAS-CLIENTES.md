# Plan — Cuentas de clientes (sitio propio, plan B) · SOLO DEV

Objetivo: que el cliente no pierda sus pedidos y pueda volver a comprar fácil, **sin contraseñas** y **sin obligar a crear cuenta**. Enlazado con la tienda demo de Tiendanube (8415696) y el ERP de prueba.

Reglas de siempre: nada en producción, la tienda real (6357775) no se toca, GitHub solo cuando lo pidas, datos de prueba inventados.

## Cómo queda para el cliente

1. **Compra sin cuenta (como hoy).** Al terminar recibe el link de su pedido (e-mail ahora; WhatsApp cuando esté conectado).
2. **"Guardá tus pedidos · Continuar con Google"** en la pantalla del pedido y en el encabezado. Un toque y queda con cuenta.
3. **Sesión recordada 90 días** en ese dispositivo. No vuelve a pedir nada salvo que cambie de dispositivo o cierre sesión.
4. **"Mis pedidos"**: historial completo, estado de cada uno y **"Repetir pedido"**.
5. **"¿Perdiste tu pedido?"**: pone su teléfono o e-mail → le llegan los links **a ese teléfono o e-mail** (nunca se muestran en pantalla).
6. **Pedidos anteriores se suman solos** cuando crea la cuenta (mismo e-mail o teléfono, verificado).

## Diseño técnico

**Entrar con Google** (Google Identity Services)
- Botón oficial de Google en el sitio → Google devuelve un token firmado → el servidor (sitio-api) verifica firma, emisor, destinatario (nuestro client ID) y vencimiento contra las claves públicas de Google.
- Solo se aceptan e-mails verificados por Google.
- No guardamos contraseñas de nada.

**Sesión**
- Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, 90 días. Token aleatorio; en la base se guarda solo su huella (hash), así una copia de la base no sirve para entrar.
- "Cerrar sesión" y "Cerrar sesión en todos los dispositivos".

**Base de datos del sitio (nueva)**
- D1 `panalera-sitio-dev` en **tu cuenta** de Cloudflare (no la de Samu).
- Tablas: `clientes` (id, e-mail, nombre, teléfono, id de cliente en Tiendanube), `sesiones` (huella del token, cliente, vence), `pedidos_cliente` (cliente ↔ número de pedido en Tiendanube), `codigos_recuperacion` (huella, vence en 15 min, un solo uso).
- Los pedidos y sus estados siguen viviendo en Tiendanube y el ERP; el sitio solo guarda a quién pertenecen.

**Enlace con Tiendanube**
- Al crear la cuenta: buscar al cliente por e-mail en la tienda demo; si no existe, crearlo. Guardar su id.
- Cada pedido nuevo con sesión se crea asociado a ese cliente (mismo e-mail).
- Sumar pedidos anteriores: los hechos sin cuenta con el mismo e-mail, o con el mismo teléfono **solo si el teléfono está verificado** (por código), para que nadie se adueñe de pedidos ajenos poniendo un número.
- El ERP no cambia: ya agrupa clientes por teléfono.
- Verificar en la etapa 0 qué permite exactamente la API de clientes de Tiendanube (búsqueda por e-mail, alta, asociación de pedidos) antes de construir.

**Link del pedido por e-mail / WhatsApp**
- E-mail: servicio de envío transaccional (a elegir; hay planes gratis para el volumen de pruebas). Requiere un remitente verificado.
- WhatsApp: se deja preparado, se activa cuando conectes WhatsApp Business (mensajes de plantilla aprobados por Meta).
- En DEV, mientras no haya servicio de envío: los mensajes se registran en un **buzón de pruebas** visible en el panel de pruebas, sin mandarse a nadie.

**Seguridad**
- "¿Perdiste tu pedido?" siempre responde lo mismo ("Si hay pedidos con ese dato, te los enviamos"), para no revelar quién es cliente.
- Límites: por IP y por teléfono/e-mail (como el checkout), anti-robots (Turnstile) en recuperación.
- "Repetir pedido" recalcula precios y stock actuales en el servidor (nunca confía en el navegador).
- Ningún dato personal en las direcciones (URL).

## Etapas (todas en DEV)

| Etapa | Qué | Necesita de vos |
|---|---|---|
| 0 | Confirmar API de clientes de Tiendanube y permisos (`read/write_customers`) de la app DEV | Si faltan permisos: reautorizar la app **en incógnito, en la tienda demo** |
| 1 | Base `panalera-sitio-dev`, sesiones, buzón de pruebas | — |
| 2 | Entrar con Google + "Mis pedidos" + cerrar sesión | Crear el acceso en Google Cloud con tu cuenta (te guío) |
| 3 | Enlace con clientes de Tiendanube y suma automática de pedidos anteriores | — |
| 4 | Link del pedido al comprar + "¿Perdiste tu pedido?" (por el buzón de pruebas) | — |
| 5 | "Repetir pedido" | — |
| 6 | Envío real de e-mails (y WhatsApp más adelante) | Elegir servicio de e-mail y verificar remitente; WhatsApp Business |
| 7 | Casos de prueba nuevos (sección K en CASOS-DE-PRUEBA.md), correrlos y publicar en el DEV en línea | Probar vos |

## Resultado de la etapa 0 (25/10/2026, solo lecturas en la tienda demo 8415696)

- **Leer clientes: OK.** `GET /customers` responde (200) y se puede buscar por `email=` o `q=` (nombre, e-mail o documento).
- **Crear clientes: falta permiso.** `POST /customers` → 403 "Missing required scope: write_customers". No se creó nada.
- **Los pedidos que crea el sitio hoy no quedan enlazados a ningún cliente** de Tiendanube (últimos 13 pedidos por API: sin cliente; solo 1 cliente en toda la tienda demo, de un pedido anterior).
- `POST /orders` solo acepta nombre, e-mail, teléfono y documento del cliente (no un id de cliente) y no documenta si enlaza a uno existente. Un pedido ya creado no se puede reasignar (PUT solo cambia nota y estado).
- Tiendanube **no ofrece login de clientes para otros sitios** (ni "Entrar con Tiendanube"). `POST /customers` acepta `password` y `send_email_invite`: no usaremos ninguno de los dos.
- Mails: con `send_confirmation_email`/`send_fulfillment_email` en falso (como hoy) Tiendanube no escribe al cliente.

**Consecuencia para el diseño:** la base del sitio es la que sabe de quién es cada pedido (no depende de Tiendanube). El enlace con el cliente de Tiendanube queda como extra de la etapa 3, si el permiso `write_customers` lo permite y la prueba confirma que el pedido se enlaza al cliente con el mismo e-mail.

**Etapa 0 cerrada (25/10):** permiso "Edit Customers" agregado a la app 48162 y reautorizada en la tienda demo (clave nueva en erp-prueba/.env.local y sitio-api/.dev.vars; la anterior sigue funcionando y es la que usan las versiones en línea).
- Prueba de enlace: cliente inventado `etapa0.cuentas.prueba@example.com` creado (id 356766710, sin mail de invitación) → pedido de prueba **#129** con ese e-mail **quedó enlazado a ese cliente** → cancelado al instante.
- **Conclusión:** si el cliente existe en Tiendanube antes de crear el pedido, el pedido se enlaza solo por e-mail. Etapa 3: al crear la cuenta (o al comprar con sesión) buscar/crear el cliente y después crear el pedido.
- Cómo autorizar sin confundir tiendas: entrar al panel de la demo (dirección `panaleraredisenodev.mitiendanube.com`, nombre "Pañalera Rediseño DEV" arriba) y en esa pestaña abrir `https://panaleraredisenodev.mitiendanube.com/admin/apps/48162/authorize`. La dirección general `www.tiendanube.com/apps/48162/authorize` usa la última tienda de la sesión (fue a la "x" dos veces; el script no guardó nada).

## Fuera de este plan (para después)
- Huella / Face ID (passkeys).
- Precios o mínimos por tipo de cliente.
- Aviso de privacidad y registro de la base (ley 25.326): lo tenés que ver vos o tu contador antes de producción.

## Resultado de la etapa 1 (25/10/2026)

- Base **`panalera-sitio-dev`** creada en la cuenta de Gaston (id 3e63d087-c47e-4ce6-b771-3f87a4cd6735), con las tablas `clientes`, `sesiones`, `pedidos_cliente`, `codigos` y `buzon` (`sitio-api/migrations/0001_cuentas.sql`). En local, la misma base vive en `sitio-api/.wrangler/`.
- Sesiones (`sitio-api/src/sesion.ts`): cookie `pmr_sesion` (HttpOnly, Secure, SameSite=Lax) de 90 días; en la base solo la huella SHA-256; se renueva sola si quedan menos de 60 días; cerrar sesión y cerrar en todos los dispositivos.
- Servidor: `GET /sesion`, `POST /sesion/cerrar`, `POST /sesion/cerrar-todas` (solo desde el sitio), `GET /buzon` (con la clave interna). CORS con credenciales solo para orígenes permitidos. Sin base, el sitio sigue funcionando sin cuentas.
- Buzón de pruebas (`sitio-api/src/buzon.ts`): guarda los mensajes sin enviarlos (últimos 200); se ve en el panel de pruebas local (sección "Buzón de pruebas").
- Pruebas automáticas: 18/18 (6 nuevas).
- Las versiones en línea todavía no se actualizaron (no hay nada visible para el cliente hasta la etapa 2).
