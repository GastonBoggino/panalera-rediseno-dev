# Pañalera Mayorista — Rediseño y sitio propio (DEV)

Repositorio **privado** con todo el trabajo del rediseño de panaleramayorista.com.ar y del circuito de pruebas sitio ↔ Tiendanube ↔ ERP. **Nada de esto está en producción.**

## Qué hay

| Carpeta | Qué es |
|---|---|
| `docs/` | Plan del sitio propio (plan B), revisión de la etapa 6, casos de prueba y diseño de los avisos ERP → Tiendanube |
| `sitio-maqueta/` | El sitio propio: la maqueta conectada al catálogo real, checkout sin cuentas, seguimiento por link privado, botón de arrepentimiento y generador de páginas para Google |
| `sitio-api/` | Servidor del sitio (Cloudflare Worker): catálogo, pedidos, seguimiento y cancelaciones contra la API de Tiendanube. Solo tienda demo |
| `panel-pruebas/` | Herramienta local para mover pedidos del ERP de prueba sin escanear (confirmar, escanear, BOX, cobrar, reparto, entregar, cancelar) |
| `erp-cambios/` | **Solo los cambios** hechos al ERP, como parches sobre `panalera-mayorista-rosario` (avisos a Tiendanube en modo live para la demo, cobro registrado, cancelaciones, pendientes del equipo) y los scripts de prueba |
| `tema-ipanema-dev/` | Plan A: plantilla Ipanema de la tienda demo con el diseño de la maqueta (`piloto-codigo/aplicar.py` lo genera) |
| `piloto-codigo/` | Código del plan A (bloques de código, colores, encabezado, tarjetas) |
| `pruebas/` | Ayudantes para correr los casos de prueba (crear pedidos, avanzar pasos, botón de arrepentimiento) |
| `maqueta/` | La maqueta original (la de Netlify), su versión publicada y los CSV exportados del catálogo |

## DEV en línea
- Sitio + servidor: `https://panalera-sitio-dev.gastonboggino.workers.dev` (cuenta de Gaston, con contraseña, noindex). Publicar: `cd sitio-api && npx wrangler deploy --config wrangler.online.jsonc` (copiar antes el sitio a `.publicar-dev`).

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
- Pruebas: `node --test sitio-api/tests/*.test.ts` (Node 24).

## Pendiente antes de publicar
Ver `docs/REVISION-ETAPA-6.md` (prioridad media: límites de Cloudflare, claves reales de Turnstile, encabezados de seguridad, caché del catálogo, avisos inmediatos).
