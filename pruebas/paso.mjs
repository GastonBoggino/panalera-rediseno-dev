// Ayudante de pruebas (DEV): node paso.mjs <pedidoERP> <idTiendanube> [accion...]
// Ejecuta acciones del panel de pruebas y muestra, después de cada una, el estado en el ERP y lo que ve el cliente.
import { readFileSync } from 'node:fs';
import { firmarPedido } from '../sitio-api/src/link.ts';
const [orden, plat, ...acciones] = process.argv.slice(2);
const secreto = readFileSync(new URL('../sitio-api/.dev.vars', import.meta.url), 'utf8').match(/^LINK_SECRET=(.*)$/m)[1];
const t = await firmarPedido(plat, secreto);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function vista() {
  const panel = (await (await fetch('http://127.0.0.1:8791/api/pedidos')).json()).pedidos.find((p) => p.id === orden) || {};
  const c = await (await fetch(`http://127.0.0.1:8788/pedido/${plat}?t=${t}`, { headers: { Origin: 'http://localhost:8787' } })).json();
  return `ERP: ${panel.comercial}/${panel.entrega}/${panel.pago}${panel.box ? ' ' + panel.box : ''} · cliente ve: ${c.etapa} · pago: ${c.pago}${c.cancelacionSolicitada ? ' · pidió cancelar' : ''}${c.cancelacionEnCurso ? ' · cancelación en curso' : ''}`;
}
console.log('inicio   ', await vista());
for (const a of acciones) {
  const r = await (await fetch(`http://127.0.0.1:8791/api/pedido/${orden}/${a}`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:8791' } })).json();
  await espera(6000);
  console.log(a.padEnd(9), (r.error ? `ERROR: ${r.error}` : r.log.join(' ')), '\n         ', await vista());
}
