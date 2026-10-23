# Sitio propio (plan B) — SOLO DEV

La maqueta de Netlify convertida en sitio: catálogo real, checkout sin cuentas, seguimiento por link privado y botón de arrepentimiento. Habla con `../sitio-api`.

- `index.html` + `sitio-b.js`: el sitio. El catálogo llega del servidor (sin costos); no hay catálogo embebido.
- `scripts/generar-paginas.mjs`: genera las páginas para Google (una por producto en `/productos/<código>/` —la misma dirección que la tienda actual—, una por rubro, `sitemap.xml`, `robots.txt` y `_redirects` desde las categorías de Tiendanube).
  - DEV: `node scripts/generar-paginas.mjs` → todo con `noindex` y `robots.txt` que bloquea.
  - Producción: `node scripts/generar-paginas.mjs --produccion` (solo con autorización).

## Qué NO se publica
- `scripts/` (es la herramienta, no el sitio).
- `imagenes-dev.json`: fotos de prueba porque la tienda demo no tiene; en producción las fotos vienen de Tiendanube.

## Antes de publicar (ver ../REVISION-ETAPA-6.md)
- Quitar `noindex` (lo hace el generador con `--produccion`; la portada `index.html` tiene su propio `noindex`).
- Claves reales de Turnstile, límites de Cloudflare y encabezados de seguridad del alojamiento.
