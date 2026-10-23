# sitio-api (plan B) — SOLO DEV

Servidor del sitio propio: la maqueta le pide el catálogo y le manda los pedidos; este servidor
habla con la API de Tiendanube. Diseño y etapas: `../PLAN-SITIO-PROPIO-B.md`.

| Ruta | Qué hace |
|---|---|
| `GET /catalogo` | Catálogo público en el formato de la maqueta (`id, variant_id, cat, brand, name, talle, units, price, sku, img, handle`). **Nunca lleva costos.** Caché de 5 minutos. |
| `GET /catalogo/interno` | El mismo catálogo con `cost`, solo con `Authorization: Bearer <CLAVE_INTERNA>`. |
| `POST /pedido` | Valida, recalcula precios con el catálogo del servidor, exige el mínimo y crea el pedido "a confirmar" (pago pendiente, sin reservar stock, sin mails). Devuelve número, total y link privado de seguimiento. |
| `GET /pedido/:id?t=…` | Seguimiento sin cuenta. Solo con la firma correcta; no devuelve teléfono ni dirección. |

Cuerpo de `POST /pedido`:

```json
{ "turnstile": "<token>", "items": [{ "variant_id": 1624197544, "quantity": 2 }],
  "cliente": { "nombre": "Ana Pérez", "telefono": "341 555-1234", "email": "" },
  "entrega": { "tipo": "retiro" },
  "pago": "efectivo", "nota": "", "empresa_web": "" }
```

Envío: `"entrega": { "tipo": "envio", "zona": "rosario" | "expreso", "calle", "numero", "piso", "ciudad", "provincia", "cp" }`.

## Seguridad

- Solo la tienda demo de Partners (8415696); la real (6357775) y la vieja "x" (8413613) están bloqueadas en el código.
- Precios y total siempre del servidor; el pedido nunca lleva costos.
- CORS solo para `ALLOWED_ORIGINS`; Cloudflare Turnstile; campo trampa `empresa_web`;
  límite de 5 pedidos cada 10 min por IP y 3 por hora por teléfono.
- Errores genéricos hacia afuera; sin datos personales en los logs.

## Correr

```bash
node --test tests/*.test.ts        # pruebas (Node 24), sin red
```

Para `wrangler dev` hace falta `.dev.vars` (no se versiona) con `TIENDANUBE_ACCESS_TOKEN`,
`TIENDANUBE_USER_AGENT`, `LINK_SECRET` (32+ caracteres) y `TURNSTILE_SECRET`
(en DEV, la clave de prueba de Cloudflare que siempre aprueba).

**No publicar** (`wrangler deploy`) sin autorización expresa.
