// Genera las páginas que Google puede leer: una por producto (/productos/<handle>/, la misma
// dirección que usa hoy la tienda Tiendanube), una por rubro, sitemap.xml, robots.txt y
// _redirects (categorías de Tiendanube → rubros nuevos).
// Uso: node scripts/generar-paginas.mjs [--produccion]
//   Sin --produccion (DEV): todo con noindex y robots.txt que bloquea el sitio.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCCION = process.argv.includes('--produccion');
const DOMINIO = 'https://panaleramayorista.com.ar';
const API = process.env.SITIO_API || 'http://127.0.0.1:8788';
// fileURLToPath: la ruta tiene "ñ" y espacios (con .pathname quedarían codificados).
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const RUBROS = {
  panales: 'Pañales', cambio: 'Cambio de pañal', bano: 'Hora del baño', perfumeria: 'Post baño y perfumería',
  alimentacion: 'Alimentación y lactancia', accesorios: 'Accesorios y regalería', adultos: 'Pañal adulto', hogar: 'Hogar y limpieza',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const precio = (n) => '$' + Math.round(n).toLocaleString('es-AR');
// JSON dentro de <script>: sin "</" para que no cierre la etiqueta.
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
const slug = (s) => String(s).trim().replace(/[^A-Za-z0-9._-]/g, '');

const res = await fetch(`${API}/catalogo`, { headers: { Origin: 'http://localhost:8787' } });
if (!res.ok) throw new Error(`El servidor del catálogo respondió ${res.status}`);
const { items } = await res.json();
if (items.some((i) => 'cost' in i)) throw new Error('El catálogo público trae costos: no se generan páginas.');
// Solo DEV: la tienda demo no tiene fotos; se usan las de la maqueta por SKU (archivo sin costos).
if (!PRODUCCION) {
  try {
    const fotos = JSON.parse(readFileSync(join(RAIZ, 'imagenes-dev.json'), 'utf8'));
    for (const it of items) if (!it.img && /^https:\/\//.test(fotos[it.sku] || '')) it.img = fotos[it.sku];
  } catch { /* sin fotos de prueba */ }
}

// Un producto puede tener varias variantes: una página por producto (handle).
const porProducto = new Map();
for (const it of items) {
  const h = slug(it.handle || it.sku);
  if (!h) continue;
  if (!porProducto.has(h)) porProducto.set(h, []);
  porProducto.get(h).push(it);
}

const robots = PRODUCCION ? '' : '<meta name="robots" content="noindex, nofollow">';
const cabecera = (titulo, descripcion, ruta, extra = '') => `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descripcion)}">${robots}
<link rel="canonical" href="${DOMINIO}${ruta}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}"><meta property="og:url" content="${DOMINIO}${ruta}">${extra}
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#1B2340;--muted:#5B6480;--line:#E1E5EE;--paper:#F7F8FB;--sun:#FFC21A;--mint:#168A5E}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Figtree,system-ui,sans-serif}
a{color:inherit}.promo{background:var(--sun);text-align:center;font-size:14px;padding:7px 16px}
header{background:#fff;border-bottom:1px solid var(--line)}.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:10px}
.logo{display:flex;gap:10px;align-items:center;text-decoration:none}.mark{width:40px;height:40px;border-radius:12px;background:var(--sun);display:grid;place-items:center;font-weight:800}
.logo b{font-family:"Bricolage Grotesque",sans-serif;font-size:19px;display:block;line-height:1}.logo small{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.btn{display:inline-block;background:var(--sun);color:var(--ink);font-weight:700;border-radius:14px;padding:12px 18px;text-decoration:none}
.btn.ghost{background:#fff;border:1px solid var(--line)}
h1,h2{font-family:"Bricolage Grotesque",sans-serif;line-height:1.1}.migas{font-size:14px;color:var(--muted);margin:16px 0}
.ficha{display:grid;grid-template-columns:1fr 1fr;gap:28px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:24px}
.ficha img{width:100%;aspect-ratio:1;object-fit:contain;background:var(--paper);border-radius:14px}
.precio{font-size:32px;font-weight:800;margin:8px 0}.chip{display:inline-block;background:#DDF3E9;color:var(--mint);border-radius:999px;padding:3px 10px;font-weight:700;font-size:14px;margin-right:6px}
.aviso{background:#FFF3CC;border-radius:14px;padding:12px 14px;font-size:14px;margin:14px 0}
.lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:0;list-style:none}
.lista a{display:block;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;text-decoration:none;height:100%}
.lista img{width:100%;aspect-ratio:1;object-fit:contain}.lista small{color:var(--muted);display:block}
footer{border-top:1px solid var(--line);margin-top:32px;padding:20px 0;color:var(--muted);font-size:14px}
@media (max-width:720px){.ficha{grid-template-columns:1fr}}
</style></head><body>
<div class="promo">Compra mínima <b>$50.000</b> combinando marcas · Precios en efectivo · Transferencia +5%</div>
<header><div class="wrap"><a class="logo" href="/"><span class="mark" aria-hidden="true">P</span><span><b>Pañalera</b><small>Mayorista · Rosario</small></span></a>
<a class="btn ghost" href="/#productos">Ver todos los productos</a></div></header><main class="wrap">`;
const pie = `</main><footer><div class="wrap">Pañalera Mayorista · Garay 1249, Rosario · Lun a vie 8–16 h, sábados 9–13 h · WhatsApp 341 753-5218</div></footer></body></html>`;

// Limpia lo generado antes (para no dejar productos que ya no existen).
for (const d of ['productos', 'categoria']) rmSync(join(RAIZ, d), { recursive: true, force: true });

for (const [handle, variantes] of porProducto) {
  const it = [...variantes].sort((a, b) => a.price - b.price)[0];
  const nombre = `${it.brand} ${it.name}`.trim();
  const rubro = RUBROS[it.cat] || 'Productos';
  const ppu = it.units ? it.price / it.units : null;
  const ruta = `/productos/${handle}/`;
  const descripcion = `${nombre} a precio mayorista: ${precio(it.price)}${it.units ? ` (${it.units} unidades, ${precio(ppu)} c/u)` : ''}. Compra mínima $50.000 combinando marcas. Retiro en Rosario o envío.`;
  const datos = {
    '@context': 'https://schema.org', '@type': 'Product', name: nombre, sku: it.sku, brand: { '@type': 'Brand', name: it.brand },
    ...(it.img ? { image: [it.img] } : {}), ...(/^\d{13}$/.test(it.sku) ? { gtin13: it.sku } : {}), category: rubro,
    offers: { '@type': 'Offer', price: String(it.price), priceCurrency: 'ARS', url: `${DOMINIO}${ruta}`, seller: { '@type': 'Organization', name: 'Pañalera Mayorista' } },
  };
  const migas = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMINIO}/` },
    { '@type': 'ListItem', position: 2, name: rubro, item: `${DOMINIO}/categoria/${it.cat}/` },
    { '@type': 'ListItem', position: 3, name: nombre },
  ] };
  const extra = `${it.img ? `<meta property="og:image" content="${esc(it.img)}">` : ''}<script type="application/ld+json">${ld(datos)}</script><script type="application/ld+json">${ld(migas)}</script>`;
  const html = cabecera(`${nombre} · Pañalera Mayorista Rosario`, descripcion, ruta, extra) + `
<nav class="migas"><a href="/">Inicio</a> › <a href="/categoria/${esc(it.cat)}/">${esc(rubro)}</a> › ${esc(nombre)}</nav>
<article class="ficha">${it.img ? `<img src="${esc(it.img)}" alt="${esc(nombre)}" width="480" height="480">` : '<div></div>'}
<div><small>${esc(it.brand)}</small><h1>${esc(it.name || nombre)}</h1>
<div>${it.talle ? `<span class="chip">Talle ${esc(it.talle)}</span>` : ''}${it.units ? `<span class="chip">${it.units} unidades</span>` : ''}</div>
<div class="precio">${precio(it.price)}</div>${ppu ? `<div><b>${precio(ppu)}</b> por unidad</div>` : ''}
<p>Precio por paquete, en efectivo. Con transferencia se suma un 5%.</p>
<div class="aviso"><b>Pedido a confirmar.</b> Armás tu pedido desde $50.000 combinando marcas y te confirmamos el stock por WhatsApp antes de que pagues.</div>
<a class="btn" href="/?agregar=${encodeURIComponent(it.variant_id)}#productos">Agregar al pedido</a></div></article>` + pie;
  mkdirSync(join(RAIZ, 'productos', handle), { recursive: true });
  writeFileSync(join(RAIZ, 'productos', handle, 'index.html'), html);
}

// Páginas por rubro con enlaces a cada producto (para que Google los encuentre).
const porRubro = new Map();
for (const [handle, v] of porProducto) {
  const it = v[0];
  if (!porRubro.has(it.cat)) porRubro.set(it.cat, []);
  porRubro.get(it.cat).push({ handle, it });
}
for (const [cat, lista] of porRubro) {
  const rubro = RUBROS[cat] || cat;
  const ruta = `/categoria/${cat}/`;
  const html = cabecera(`${rubro} por mayor en Rosario · Pañalera Mayorista`, `${rubro} a precio mayorista en Rosario: ${lista.length} productos. Compra mínima $50.000 combinando marcas.`, ruta) + `
<nav class="migas"><a href="/">Inicio</a> › ${esc(rubro)}</nav><h1>${esc(rubro)}</h1><p>${lista.length} productos · precios por paquete, en efectivo.</p>
<ul class="lista">${lista.sort((a, b) => a.it.brand.localeCompare(b.it.brand)).map(({ handle, it }) => `<li><a href="/productos/${handle}/">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" width="220" height="220">` : ''}<small>${esc(it.brand)}</small><b>${esc(it.name)}</b><div>${precio(it.price)}</div></a></li>`).join('')}</ul>` + pie;
  mkdirSync(join(RAIZ, 'categoria', cat), { recursive: true });
  writeFileSync(join(RAIZ, 'categoria', cat, 'index.html'), html);
}

// sitemap.xml y robots.txt
const urls = ['/', ...[...porRubro.keys()].map((c) => `/categoria/${c}/`), ...[...porProducto.keys()].map((h) => `/productos/${h}/`)];
writeFileSync(join(RAIZ, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${DOMINIO}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(RAIZ, 'robots.txt'), PRODUCCION ? `User-agent: *\nAllow: /\nSitemap: ${DOMINIO}/sitemap.xml\n` : `# DEV: no indexar\nUser-agent: *\nDisallow: /\n`);

// _redirects: categorías de Tiendanube → rubros nuevos (formato de Cloudflare Pages / Netlify).
let redirecciones = '# Direcciones de la tienda Tiendanube que cambian → sitio propio (301 = permanente)\n';
try {
  const vars = Object.fromEntries(readFileSync(join(RAIZ, '../sitio-api/.dev.vars'), 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  const r = await fetch(`https://api.tiendanube.com/v1/${vars.TIENDANUBE_STORE_ID}/categories?per_page=200&fields=id,name,handle,parent`, { headers: { Authentication: `bearer ${vars.TIENDANUBE_ACCESS_TOKEN}`, 'User-Agent': vars.TIENDANUBE_USER_AGENT } });
  const cats = await r.json();
  const porId = new Map(cats.map((c) => [c.id, c]));
  const MAPA = { 'pañales': 'panales', 'hora del baño': 'bano', 'post baño': 'perfumeria', 'cambio de pañal': 'cambio', 'hogar': 'hogar', 'adultos': 'adultos', 'accesorios': 'accesorios', 'regaleria': 'accesorios', 'hora de comer': 'accesorios', 'lactancia materna': 'alimentacion', 'mamadera': 'alimentacion', 'vasos': 'alimentacion', 'sacaleche': 'alimentacion', 'chupetes': 'alimentacion', 'electrico': 'alimentacion', 'combos': 'alimentacion', 'alimentacion': 'alimentacion', 'cuidado personal': '', 'limpieza': 'hogar' };
  for (const c of cats) {
    const camino = [];
    for (let x = c; x; x = porId.get(x.parent)) camino.unshift((x.handle?.es || Object.values(x.handle || {})[0] || '').trim());
    const nombre = (c.name?.es || '').trim().toLowerCase();
    const destino = MAPA[nombre] ? `/categoria/${MAPA[nombre]}/` : '/#productos';
    if (camino.every(Boolean)) redirecciones += `/${camino.join('/')}/  ${destino}  301\n`;
  }
} catch (e) { redirecciones += `# No se pudieron leer las categorías: ${e.message}\n`; }
redirecciones += '/productos/  /#productos  301\n';
writeFileSync(join(RAIZ, '_redirects'), redirecciones);

console.log(`Listo (${PRODUCCION ? 'PRODUCCIÓN' : 'DEV, con noindex'}): ${porProducto.size} páginas de producto, ${porRubro.size} rubros, ${urls.length} direcciones en sitemap.xml, ${redirecciones.split('\n').filter((l) => l.startsWith('/')).length} redirecciones.`);
