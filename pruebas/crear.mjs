// node crear.mjs "<nombre>" retiro|envio  → crea un pedido de prueba en la tienda demo (por el servidor del sitio),
// lo importa al ERP de prueba y muestra: númeroERP idTiendanube token
const [nombre, tipo = 'retiro'] = process.argv.slice(2);
const O = { Origin: 'http://localhost:8787' };
const { items } = await (await fetch('http://127.0.0.1:8788/catalogo', { headers: O })).json();
const q = { '7794626013553': 2, '7500435207508': 1 };
const body = {
  turnstile: 'XXXX.DUMMY.TOKEN.XXXX', pago: 'efectivo', nota: 'PRUEBA casos. No preparar.',
  items: items.filter((i) => q[i.sku]).map((i) => ({ variant_id: i.variant_id, quantity: q[i.sku] })),
  cliente: { nombre, telefono: process.argv[4] || `341 555-${String(Math.floor(Math.random() * 9000) + 1000)}` },
  entrega: tipo === 'envio' ? { tipo: 'envio', zona: 'rosario', calle: 'Calle de Prueba', numero: '100', ciudad: 'Rosario', provincia: 'Santa Fe', cp: '2000' } : { tipo: 'retiro' },
};
const r = await (await fetch('http://127.0.0.1:8788/pedido', { method: 'POST', headers: { ...O, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
if (!r.seguimiento) { console.error("No se creó:", JSON.stringify(r)); process.exit(1); }
const [, id, t] = r.seguimiento.match(/\/pedido\/(\d+)\?t=(\w+)/);
await fetch('http://127.0.0.1:8791/api/importar', { method: 'POST', headers: { Origin: 'http://127.0.0.1:8791' } });
console.log(r.numero, id, t);
