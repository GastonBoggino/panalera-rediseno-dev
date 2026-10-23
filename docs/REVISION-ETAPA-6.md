# Etapa 6 — Revisión del sitio propio antes de publicar

Fecha: 23/10/2026 · Alcance: sitio propio (`sitio-maqueta`), su servidor (`sitio-api`), los cambios del ERP de prueba y el panel de pruebas. Todo en DEV: nada se publicó.

## Resumen

El circuito funciona y es razonablemente seguro para DEV. **No está listo para publicar**: hay 4 puntos de prioridad alta que resolver antes, ninguno difícil. Los problemas que se podían corregir en el código ya están corregidos y probados.

## Corregido en esta etapa (con pruebas)

| # | Problema | Riesgo | Corrección |
|---|---|---|---|
| 1 | Nombres e imágenes de productos se mostraban sin limpiar | Si alguien con acceso al panel de Tiendanube (o una app con permisos) metía código en un nombre, se ejecutaba en el navegador de los clientes | Se limpian en el servidor y otra vez en el sitio; solo imágenes `https://` |
| 2 | El botón de arrepentimiento cancelaba solo un pedido **ya cobrado** que aún no se preparaba | Dinero a devolver sin que nadie se entere | Si está cobrado, solo registra el pedido de cancelación |
| 3 | El límite de tamaño del pedido dependía de un encabezado que se puede omitir | Envíos enormes al servidor | Se mide el contenido real |
| 4 | La caché del catálogo se pisaba entre "con costos" y "sin costos" | Lentitud y más llamadas a Tiendanube | Una sola caché; los costos se quitan al responder |
| 5 | En celular los campos tenían 13–15 px | iPhone hace zoom al tocarlos | 16 px mínimo en celular |

Pruebas: sitio-api 12/12 · ERP (avisos + cancelaciones + permisos) en verde.

## Pendiente antes de publicar

### Prioridad alta — RESUELTOS en DEV (23/10/2026)
- 1 ✓ Sin catálogo embebido: `index.html` pasó de 236 KB a ~91 KB y no tiene costos (fotos de prueba en `imagenes-dev.json`, sin costos, solo DEV).
- 2 ✓ `GET /catalogo` nunca lleva costos; `GET /catalogo/interno` con la clave del local.
- 3 ✓ Envoltorio de la maqueta oculto: el sitio se ve a pantalla completa en computadora y celular.
- 4 ✓ `scripts/generar-paginas.mjs`: 509 páginas de producto en `/productos/<código>/` (misma dirección que la tienda actual) con datos estructurados Product y BreadcrumbList, 8 rubros, `sitemap.xml` (518 direcciones), `robots.txt` y 21 redirecciones 301 de categorías de Tiendanube. Título y descripción en la portada; enlaces a rubros en el pie. En DEV todo con `noindex`.

Texto original de los pendientes:
1. **Sacar el catálogo embebido de la maqueta** (`const P` en `index.html`, 146 KB): incluye los **costos** y cualquiera los ve con "ver código fuente", aunque el servidor los apague. Hoy solo se usa para las fotos (la tienda demo no tiene); en producción las fotos vienen de Tiendanube.
2. **Costos fuera del catálogo público** (`INCLUIR_COSTOS=0`), o detrás de un acceso solo para el local. Hoy el catálogo DEV los entrega a cualquiera que lo pida directo.
3. **Sacar el encabezado de "propuesta de rediseño"** (Computadora/Celular, "Ver costos (interno)", "Ver pantalla"): es de la maqueta, en celular ocupa toda la primera pantalla y muestra la casilla de costos.
4. **Páginas de producto para Google y redirecciones**: hoy el catálogo se dibuja con JavaScript y no hay páginas por producto; Google casi no lo ve. La tienda actual tiene páginas `/productos/<código>/` indexadas que traen visitas. Hay que generar páginas por producto **con las mismas direcciones** (los códigos ya coinciden), datos estructurados de producto, `sitemap.xml` y redirecciones 301 para lo que cambie, y quitar el `noindex`.

### Prioridad media
5. **Límites contra abuso reales**: hoy son en memoria (sirven en una sola instancia). En Cloudflare usar su limitador de pedidos.
6. **Claves reales de Turnstile** (las actuales son de prueba y aprueban siempre).
7. **Encabezados de seguridad del sitio** al alojarlo (CSP que permita solo Turnstile y el servidor propio, HSTS, etc.).
8. **Primera carga del catálogo**: sin caché tarda ~1,5–2,5 s (lo pide a Tiendanube). Guardarlo en la caché de Cloudflare o generarlo cada pocos minutos.
9. **Aviso inmediato de cancelaciones**: el ERP revisa la web cada 5 minutos. Con dirección pública se pueden usar los avisos de Tiendanube (webhooks).
10. **Descripción, datos para redes (Open Graph) y dirección canónica** en la página.

### Prioridad baja
11. El link privado de seguimiento queda guardado en el navegador del cliente: en una computadora compartida lo vería otro. Ofrecer "olvidar este pedido".
12. Un pedido sin e-mail usa uno ficticio `@sin-email.invalid` para Tiendanube: confirmar que no genera rebotes ni avisos.
13. Revisar con contador/abogado el alcance del botón de arrepentimiento (Res. 424/2020), incluido después de la entrega.

## Verificado y bien
- Precios y total siempre del servidor; el pedido nunca lleva costos.
- Solo tienda demo: la real y la vieja "x" bloqueadas en el código (sitio y ERP).
- El link de un pedido no abre otro (firma de 128 bits); el seguimiento no devuelve teléfono ni dirección.
- Errores genéricos hacia afuera; sin datos personales en los mensajes.
- Celular: sin desplazamiento horizontal; checkout y seguimiento usables.
- Peso: ~80 KB comprimidos (sin contar el catálogo embebido a quitar); fotos con carga diferida; catálogo en caché responde en ~2 ms.
- ERP: las tareas pendientes ahora llegan al tablero sin abrir datos administrativos.
