// Arma el catálogo reducido del ERP (código de barras, nombre y partes) para el panel en línea.
// Uso: node generar-catalogo.mjs  (antes de publicar)
import { readFileSync, writeFileSync } from 'node:fs';
const base = JSON.parse(readFileSync(new URL('../../erp-prueba/app/productCatalog.generated.json', import.meta.url), 'utf8'));
const reducido = Object.fromEntries(base.map((p) => [String(p.sku).toUpperCase(), [String(p.barcode || p.sku), p.name, (p.parts || []).map((x) => [x.part ?? 1, x.component || 'UNIDAD', x.componentSku || null])]]));
writeFileSync(new URL('./catalogo-erp.json', import.meta.url), JSON.stringify(reducido));
console.log(`catalogo-erp.json: ${base.length} productos`);
