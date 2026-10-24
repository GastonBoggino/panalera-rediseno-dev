// Catálogo del sitio con el mismo formato que usa la maqueta (const P),
// más el variant_id que hace falta para crear el pedido.
import type { Api } from './tiendanube.ts';

export type Item = {
  id: number; variant_id: number; cat: string; brand: string; name: string; talle: string | null;
  units: number | null; price: number; cost?: number; sku: string; img: string; handle: string;
};

// Subcategoría de Tiendanube → rubro de la maqueta.
const RUBROS: Record<string, string> = {
  'pañales': 'panales', 'hora del baño': 'bano', 'post baño': 'perfumeria', 'cambio de pañal': 'cambio',
  'hogar': 'hogar', 'adultos': 'adultos', 'accesorios': 'accesorios', 'regaleria': 'accesorios', 'hora de comer': 'accesorios',
  'lactancia materna': 'alimentacion', 'mamadera': 'alimentacion', 'vasos': 'alimentacion', 'sacaleche': 'alimentacion',
  'chupetes': 'alimentacion', 'electrico': 'alimentacion', 'combos': 'alimentacion',
};
const MARCAS_COMPUESTAS = ['JOHNSON & JOHNSON', 'BABY DOVE', 'LADY SOFT', 'BABY SEC'];

const UNIT_RE = /(?:\bx\s?|\b(?:RN|PR|P|M|G|XG|XXG|XXXG|XX|J)\s?)(\d{1,3})\b(?!\s?(?:ml|gr?|cm|kg|lts?|cc)\b)/gi;
const TALLE_RE = /\b(RN|PR|P|M|G|XG|XXG|XXXG|XX|J)\s?\d{1,3}\b/i;

const es = (v: any) => (typeof v === 'string' ? v : v?.es || Object.values(v || {})[0] || '') as string;
// Los textos vienen del panel de Tiendanube y el sitio los muestra: sin caracteres que permitan inyectar HTML.
export const textoSeguro = (v: string) => v.replace(/[<>"'`]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
// Solo imágenes https (el CDN de Tiendanube); cualquier otra cosa se descarta.
export const imagenSegura = (v: unknown) => (/^https:\/\/[^\s"'<>]+$/.test(String(v || '')) ? String(v) : '');

// "x500" en un óleo o un algodón son ml o gramos, no unidades: el "xN" solo cuenta en productos
// que se venden por unidad. Los talles de pañales ("G60", "XG52") cuentan siempre.
const POR_UNIDAD = /TOALL|PA[ÑN]AL|PANTS|AP[OÓ]SIT|PROTECTOR|DISCO|HISOP|BOLSA|COMPRES|ALMOHADILL|BABERO|SABANITA|INCONT/i;
export function unidades(nombre: string) {
  let m: RegExpExecArray | null, last: number | null = null;
  const porUnidad = POR_UNIDAD.test(nombre);
  UNIT_RE.lastIndex = 0;
  while ((m = UNIT_RE.exec(nombre))) {
    if (/^x\s?\d/i.test(m[0]) && !porUnidad) continue;
    last = Number(m[1]);
  }
  return last && last > 1 ? last : null;
}

export function rubro(categorias: any[], nombre = '') {
  const nombres = (categorias || []).map((c) => es(c?.name).trim().toLowerCase());
  for (const n of nombres.reverse()) if (RUBROS[n]) return RUBROS[n];
  // Productos sin categoría en Tiendanube: se deduce por el nombre.
  if (/PA[ÑN]AL|PANTS/i.test(nombre)) return /INCONT|ADULT/i.test(nombre) ? 'adultos' : 'panales';
  if (/TOALL(AS|ITAS) H[UÚ]MEDAS/i.test(nombre)) return 'cambio';
  return 'accesorios';
}

function separarMarca(nombre: string) {
  const upper = nombre.toUpperCase();
  const compuesta = MARCAS_COMPUESTAS.find((m) => upper.startsWith(m + ' '));
  const marca = compuesta || nombre.split(/\s+/)[0];
  return { brand: marca.toUpperCase(), name: nombre.slice(marca.length).trim() || nombre };
}

export function mapearProductos(productos: any[], incluirCostos: boolean): Item[] {
  const items: Item[] = [];
  for (const p of productos) {
    if (!p.published) continue;
    const nombreBase = textoSeguro(es(p.name));
    const imagenes = new Map((p.images || []).map((i: any) => [i.id, i.src]));
    for (const v of p.variants || []) {
      const price = Math.round(Number(v.promotional_price || v.price || 0));
      if (!(price > 0) || v.visible === false) continue;
      const extra = textoSeguro((v.values || []).map(es).filter(Boolean).join(' '));
      const completo = extra && !nombreBase.toUpperCase().includes(extra.toUpperCase()) ? `${nombreBase} ${extra}` : nombreBase;
      const { brand, name } = separarMarca(completo);
      const talle = completo.match(TALLE_RE)?.[1]?.toUpperCase() || null;
      const item: Item = {
        id: Number(v.id), variant_id: Number(v.id), cat: rubro(p.categories, completo), brand, name, talle,
        units: unidades(completo), price, sku: String(v.sku || ''),
        img: imagenSegura(imagenes.get(v.image_id) || p.images?.[0]?.src), handle: textoSeguro(es(p.handle)),
      };
      if (incluirCostos && v.cost != null && v.cost !== '') item.cost = Math.round(Number(v.cost));
      items.push(item);
    }
  }
  return items;
}

// Caché en memoria por instancia: el catálogo cambia poco y así no se golpea la API en cada visita.
let cache: { at: number; items: Item[] } | null = null;
const VIGENCIA_MS = 5 * 60 * 1000;

// Se guarda una sola versión (con costos) y se quitan al devolverla si no corresponde.
export async function cargarCatalogo(api: Api, incluirCostos: boolean, ahora = Date.now()) {
  const salida = (items: Item[]) => (incluirCostos ? items : items.map(({ cost, ...resto }) => resto));
  if (cache && ahora - cache.at < VIGENCIA_MS) return salida(cache.items);
  const productos: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const lote = await api(`/products?published=true&per_page=200&page=${page}&fields=id,name,handle,published,categories,images,variants`);
    if (!Array.isArray(lote) || lote.length === 0) break;
    productos.push(...lote);
    if (lote.length < 200) break;
  }
  cache = { at: ahora, items: mapearProductos(productos, true) };
  return salida(cache.items);
}

export function limpiarCacheCatalogo() { cache = null; }
