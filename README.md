# Pañalera Mayorista — Rediseño y sitio propio (DEV)

Repositorio **privado** con todo el trabajo del rediseño de panaleramayorista.com.ar y del circuito de pruebas sitio ↔ Tiendanube ↔ ERP. **Nada de esto está en producción.**

## Qué hay

| Carpeta | Qué es |
|---|---|
| `docs/` | Plan del sitio propio (plan B), plan de cuentas de clientes (`PLAN-CUENTAS-CLIENTES.md`), revisión de la etapa 6, casos de prueba y diseño de los avisos ERP → Tiendanube |
| `sitio-maqueta/` | El sitio propio: la maqueta conectada al catálogo real, checkout (comprar sin cuenta sigue igual), cuentas opcionales con "Continuar con Google" y "Mis pedidos", seguimiento por link privado, botón de arrepentimiento y generador de páginas para Google |
| `sitio-api/` | Servidor del sitio (Cloudflare Worker): catálogo, pedidos, seguimiento y cancelaciones contra la API de Tiendanube (solo tienda demo); cuentas sin contraseñas (Google, sesiones de 90 días, base D1 `panalera-sitio-dev`) y buzón de pruebas |
| `panel-pruebas/` | Herramienta para mover pedidos del ERP de prueba sin escanear (confirmar, escanear, BOX, cobrar, reparto, entregar, cancelar). Local (`server.mjs`) y en línea (`en-linea/`), con la lógica compartida en `nucleo.mjs`. El local muestra el buzón de pruebas |
| `erp-cambios/` | **Solo los cambios** hechos al ERP, como parches sobre `panalera-mayorista-rosario` (avisos a Tiendanube en modo live para la demo, cobro registrado, cancelaciones, pendientes del equipo, ERP en línea con contraseña y la pestaña **Pedidos WEB**) y los scripts de prueba |
| `tema-ipanema-dev/` | Plan A: plantilla Ipanema de la tienda demo con el diseño de la maqueta (`piloto-codigo/aplicar.py` lo genera) |
| `piloto-codigo/` | Código del plan A (bloques de código, colores, encabezado, tarjetas) |
| `pruebas/` | Ayudantes para correr los casos de prueba (crear pedidos, avanzar pasos, botón de arrepentimiento) |
| `maqueta/` | La maqueta original (la de Netlify), su versión publicada y los CSV exportados del catálogo |

## DEV en línea (cuenta de Cloudflare de Gaston, todo con contraseña y noindex)
- Sitio + servidor: `https://panalera-sitio-dev.gastonboggino.workers.dev`. Publicar: `cd sitio-api && npx wrangler deploy --config wrangler.online.jsonc` (copiar antes el sitio a `.publicar-dev`). Base D1 `panalera-sitio-dev` (migraciones en `sitio-api/migrations/`).
- ERP de prueba: `https://panalera-erp-dev.gastonboggino.workers.dev` (parche 0008, `wrangler.dev-online.jsonc`).
- Panel de pruebas: `https://panalera-panel-dev.gastonboggino.workers.dev` (misma contraseña que el ERP en línea). Publicar: `cd panel-pruebas/en-linea && node generar-catalogo.mjs && npx wrangler deploy --config wrangler.panel-online.jsonc`.
- "Continuar con Google": proyecto de Google Cloud "Panalera Mayoritas" (cuenta gastonboggino3), en modo prueba: solo entran los usuarios de prueba.

## Reglas
- **Tienda real (6357775): solo lectura.** Todo se prueba en la tienda demo de Partners (8415696). La real está bloqueada en el código.
- **Nunca usar `erp-prueba/wrangler.jsonc`**: apunta a producción. El ERP se prueba con la "prueba local aislada".
- **Las claves no se suben** (`.dev.vars`, `.env.local`, `.nuvem`). Están en la Mac donde se trabaja.
- Instalar o autorizar apps de Tiendanube **solo en incógnito**, logueado únicamente en la tienda demo.

## Cómo correr en local
- Servidor del sitio: `cd sitio-api && npx wrangler dev --local --port 8788` (necesita `.dev.vars`; ver `sitio-api/README.md`).
- Sitio: `python3 -m http.server 8787 --directory sitio-maqueta`.
- Panel de pruebas: `node panel-pruebas/server.mjs` (puerto 8791; necesita el ERP de prueba en 8790).
- ERP: aplicar `erp-cambios/parches/*.patch` sobre una copia de `panalera-mayorista-rosario` (`git am erp-cambios/parches/*.patch`) y usar la prueba local aislada.
- Pruebas: `node --test sitio-api/tests/*.test.ts` (Node 24). Base local: `npx wrangler d1 migrations apply panalera-sitio-dev --local` dentro de `sitio-api`.
- Comandos de Cloudflare: siempre con `--config` (la del archivo) para no tocar la cuenta de producción.

## Pendiente antes de publicar
Ver `docs/REVISION-ETAPA-6.md` (prioridad media: límites de Cloudflare, claves reales de Turnstile, encabezados de seguridad, caché del catálogo, avisos inmediatos).
