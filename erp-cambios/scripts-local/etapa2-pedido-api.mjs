// Etapa 2 del plan B: crear UN pedido "a confirmar" por la API de Tiendanube en la
// tienda DEV y comprobar que el ERP lo importaría igual que un pedido web.
// Usa la clave guardada en .env.local (solo tiendas DEV) y el mismo código de
// normalización del ERP (app/api/tiendanube/route.ts y customerImport.ts).
//
// Uso (con Node 24):
//   node scripts-local/etapa2-pedido-api.mjs            → solo revisa y muestra qué haría
//   node scripts-local/etapa2-pedido-api.mjs --crear    → crea el pedido de prueba
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { normalizeWebContact } from "../app/api/tiendanube/customerImport.ts";
import { orderImportFields } from "../app/api/tiendanube/http.ts";

const TIENDAS_DEV = ["8415696"];
const TIENDA_REAL = "6357775";
const MINIMO = 50000;
const crear = process.argv.includes("--crear");

const env = Object.fromEntries((await readFile(new URL("../.env.local", import.meta.url), "utf8"))
  .split("\n").map((line) => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const storeId = env.TIENDANUBE_STORE_ID;
if (storeId === TIENDA_REAL || !TIENDAS_DEV.includes(storeId)) throw new Error(`Tienda ${storeId}: este script solo corre contra las tiendas DEV (${TIENDAS_DEV.join(", ")}).`);
if (!env.TIENDANUBE_ACCESS_TOKEN) throw new Error("Falta la clave: instalá la app en la tienda de prueba y corré obtener-token-tiendanube.mjs.");

const api = async (path, init = {}) => {
  const response = await fetch(`https://api.tiendanube.com/v1/${storeId}${path}`, {
    ...init,
    headers: { Authentication: `bearer ${env.TIENDANUBE_ACCESS_TOKEN}`, "User-Agent": env.TIENDANUBE_USER_AGENT || "Panalera DEV", "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${JSON.stringify(body)}`);
  return body;
};

// Normalización del ERP, tomada textualmente de route.ts para no reescribirla.
const routeSource = await readFile(new URL("../app/api/tiendanube/route.ts", import.meta.url), "utf8");
const pick = (name) => {
  const start = routeSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`No encontré ${name} en route.ts`);
  let depth = 0, i = routeSource.indexOf("{", start);
  for (; i < routeSource.length; i++) { if (routeSource[i] === "{") depth++; else if (routeSource[i] === "}" && --depth === 0) break; }
  return routeSource.slice(start, i + 1);
};
const erpCode = stripTypeScriptTypes(["value", "localized", "normalizeOrder"].map(pick).join("\n"));
const normalizeOrder = new Function("normalizeWebContact", `${erpCode}\nreturn normalizeOrder;`)(normalizeWebContact);
const resumen = (order) => {
  const n = normalizeOrder(order);
  return { modo: n.mode, entrega: n.deliveryDetail, cliente: n.customer, telefono: n.customerPhone ? `…${n.customerPhone.slice(-3)}` : "(falta)", items: n.items, estado: n.status, origen: n.source };
};

// 1. Confirmar contra la API que la clave es de la tienda de prueba.
const store = await api("/store?fields=id,name");
if (String(store.id) !== storeId || !TIENDAS_DEV.includes(storeId)) throw new Error(`La clave responde por la tienda ${store.id}. Se cancela.`);
console.log(`Tienda: ${store.id} (${typeof store.name === "object" ? Object.values(store.name)[0] : store.name}) ✓`);

// 2. Referencia: el pedido web más reciente, tal como lo ve el ERP.
const abiertos = await api(`/orders?status=open&per_page=1&fields=${orderImportFields}`).catch(() => []);
if (abiertos[0]) console.log("\nReferencia, pedido web #%s según el ERP:", abiertos[0].number, resumen(abiertos[0]));

// 3. Armar el pedido con productos reales hasta superar el mínimo.
const productos = await api("/products?per_page=30&published=true&fields=id,name,variants");
const variantes = productos.flatMap((p) => p.variants.map((v) => ({ variant_id: v.id, sku: v.sku, price: Number(v.price), name: Object.values(p.name)[0] })))
  .filter((v) => v.sku && v.price > 0).slice(0, 3);
if (variantes.length === 0) throw new Error("No encontré productos publicados con SKU y precio.");
let total = 0;
const items = variantes.map((v) => ({ ...v, quantity: 1 }));
for (let i = 0; total < MINIMO; i = (i + 1) % items.length) { items[i].quantity++; total = items.reduce((s, x) => s + x.price * x.quantity, 0); }
total = items.reduce((s, x) => s + x.price * x.quantity, 0);

const pedido = {
  gateway: "offline",
  payment_status: "pending",
  inventory_behaviour: "bypass",
  send_confirmation_email: false,
  send_fulfillment_email: false,
  shipping_pickup_type: "pickup",
  shipping: "not-provided",
  shipping_option: "Retiro en el local (Garay 1249)",
  shipping_cost_customer: 0,
  note: "PRUEBA etapa 2 (pedido creado por API desde el sitio propio). No preparar.",
  customer: { name: "Prueba API Sitio", email: "prueba-api-sitio@example.com", phone: "+5493410000000" },
  products: items.map(({ variant_id, quantity }) => ({ variant_id, quantity })),
};
const direccion = { first_name: "Prueba", last_name: "API", address: "Garay", number: 1249, city: "Rosario", province: "Santa Fe", zipcode: "2000", country: "AR" };
pedido.billing_address = direccion;
pedido.shipping_address = direccion;

console.log("\nPedido a crear (total esperado $%s):", total.toLocaleString("es-AR"));
console.table(items.map(({ sku, name, price, quantity }) => ({ sku, name: name.slice(0, 40), price, quantity })));
if (!crear) { console.log("\nSolo revisión. Para crearlo: node scripts-local/etapa2-pedido-api.mjs --crear"); process.exit(0); }

// 4. Crear y releer el pedido con los mismos campos que usa el importador del ERP.
const creado = await api("/orders", { method: "POST", body: JSON.stringify(pedido) });
console.log(`\nCreado: pedido #${creado.number} (id ${creado.id}), pago: ${creado.payment_status}, estado: ${creado.status}, total: $${creado.total}`);
const leido = await api(`/orders/${creado.id}?fields=${orderImportFields}`);
const comoErp = resumen(leido);
console.log("\nCómo lo importaría el ERP:", comoErp);

const problemas = [];
if (leido.shipping_status && leido.shipping_status !== "unpacked") problemas.push(`shipping_status=${leido.shipping_status}: el importador lo saltearía`);
if (comoErp.modo !== "Retiro en depósito") problemas.push(`modo "${comoErp.modo}", se esperaba retiro`);
if (comoErp.telefono === "(falta)") problemas.push("sin teléfono: el ERP no crearía la ficha del cliente");
if (comoErp.items.length !== items.length) problemas.push("el ERP no reconoce todos los productos (SKU)");
const totalErp = comoErp.items.reduce((s, x) => s + x.unitPrice * x.qty, 0);
if (Math.abs(totalErp - total) > items.length) problemas.push(`total ERP $${totalErp} ≠ esperado $${total}`);
console.log(problemas.length ? `\n✗ Problemas:\n- ${problemas.join("\n- ")}` : "\n✓ El ERP lo importaría como un pedido web normal (cotización pendiente, retiro, con teléfono y productos).");
