// Panel de pruebas (SOLO DEV): mueve pedidos del ERP de prueba local sin escanear a mano.
// Habla únicamente con la prueba local aislada del ERP (127.0.0.1:8790) y antes de cada
// acción verifica que esté conectada a la tienda demo "Pañalera Rediseño DEV".
// Escanea como el PDA: una lectura por unidad con el código de barras del producto.
// Uso: node server.mjs  →  http://127.0.0.1:8791
import http from 'node:http';
import { readFileSync } from 'node:fs';

const ERP = 'http://127.0.0.1:8790';
const PUERTO = 8791;
const TIENDA_DEMO = 'Pañalera Rediseño DEV';
// Usuario de los datos de ejemplo de la prueba local (tests/fixtures), no de producción.
const OPERADOR = { operator: 'Samu Pereyra', pin: '3333', device: 'Panel de pruebas' };
const PAUSA_ESCANEO_MS = 250;

const catalogoBase = JSON.parse(readFileSync(new URL('../erp-prueba/app/productCatalog.generated.json', import.meta.url), 'utf8'));
const PRODUCTOS = new Map(catalogoBase.map((p) => [String(p.sku).toUpperCase(), p]));

let cookie = '';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function erp(path, body) {
  const intento = async () => fetch(ERP + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Origin: ERP, Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await intento();
  if (r.status === 401) { await login(); r = await intento(); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `El ERP respondió ${r.status}`);
  return data;
}

async function login() {
  const r = await fetch(ERP + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ERP }, body: JSON.stringify(OPERADOR) });
  if (!r.ok) throw new Error('No pude entrar al ERP de prueba con el usuario de ejemplo.');
  cookie = (r.headers.getSetCookie?.() || [r.headers.get('set-cookie') || '']).map((c) => c.split(';')[0]).join('; ');
}

// Candado: solo se trabaja si el ERP local está conectado a la tienda demo.
async function verificarEntorno() {
  const t = await erp('/api/tiendanube');
  if (t.storeName !== TIENDA_DEMO) throw new Error(`El ERP no está conectado a la tienda demo (dice: ${t.storeName || 'sin tienda'}). No hago nada.`);
}

async function pedidos() {
  const d = await erp('/api/warehouse?scope=orders');
  const sesiones = new Map((d.orderSessions || []).map((s) => [s.orderId, s.status]));
  const progreso = new Map((d.orderProgress || []).map((p) => [p.orderId, p]));
  return (d.externalOrders || []).filter((o) => !o.archivedAt || o.commercialStatus === 'cancelled').map((o) => ({
    id: o.id, cliente: o.customer, origen: o.source, modo: o.mode, estado: o.status, domicilio: o.deliveryDetail || '',
    comercial: o.commercialStatus, entrega: o.deliveryStatus, pago: o.paymentStatus, version: o.workflowVersion,
    box: d.boxAssignments?.[o.id] || o.workflowBox || '', items: o.items,
    vuelveAlLocal: (d.webCancelledInRoute || []).includes(o.id), pidioCancelar: (d.cancelRequests || []).includes(o.id),
    preparacion: sesiones.get(o.id) || '', leidas: progreso.get(o.id)?.picked?.length || 0,
  }));
}

const pedido = async (id) => {
  const p = (await pedidos()).find((x) => x.id === id);
  if (!p) throw new Error(`No encontré el pedido #${id}.`);
  return p;
};

// Unidades a preparar, con el mismo formato que arma el PDA (orderParts).
function requisitos(items) {
  const lista = [];
  items.forEach((item, i) => {
    const prod = PRODUCTOS.get(String(item.sku).toUpperCase());
    const partes = prod?.parts?.length ? prod.parts : [{ part: 1, component: 'UNIDAD' }];
    for (let u = 0; u < item.qty; u++) {
      for (const parte of partes) {
        lista.push({
          req: `${parte.componentSku || item.sku}|${parte.part}|${parte.component}|${i + 1}-${u + 1}`,
          codigo: String(prod?.barcode || item.sku),
          nombre: prod?.name || item.sku,
        });
      }
    }
  });
  return lista;
}

const pasos = {
  async confirmar(p, log) {
    if (p.comercial === 'confirmed') return log.push('Ya estaba confirmado.');
    await erp('/api/warehouse', { action: 'update-order-workflow', orderId: p.id, expectedVersion: p.version, commercialStatus: 'confirmed' });
    log.push('Confirmado (el cliente aceptó la cotización).');
  },
  async cotizar(p, log) {
    await erp('/api/warehouse', { action: 'update-order-workflow', orderId: p.id, expectedVersion: p.version, commercialStatus: 'quote_sent' });
    log.push('Cotización marcada como enviada.');
  },
  async escanear(p, log) {
    if (p.comercial !== 'confirmed') throw new Error('Primero hay que confirmar el pedido.');
    await erp('/api/warehouse', { action: 'start-order', orderId: p.id });
    log.push('Preparación iniciada.');
    const reqs = requisitos(p.items);
    const d = await erp('/api/warehouse?scope=orders');
    const previo = (d.orderProgress || []).find((x) => x.orderId === p.id);
    const picked = [...(previo?.picked || [])], codes = [...(previo?.pickedBoxCodes || [])];
    let n = 0;
    for (const r of reqs) {
      if (picked.includes(r.req)) continue;
      picked.push(r.req); codes.push(`${r.codigo}::${r.req}`);
      const completo = picked.length === reqs.length;
      try {
        await erp('/api/warehouse', {
          action: 'picking', orderId: p.id, picked, pickedBoxCodes: codes, scanRequirement: r.req, scanCode: r.codigo,
          productScan: true, manualConfirmation: false, status: completo ? 'complete' : 'in_progress', operator: OPERADOR.operator,
        });
      } catch (e) {
        throw new Error(`Escaneando ${r.nombre} (${r.codigo}): ${e.message}${/catálogo|identificar|no corresponde/i.test(e.message) ? ' → probá "Sincronizar catálogo".' : ''}`);
      }
      n++;
      await espera(PAUSA_ESCANEO_MS);
    }
    log.push(`Escaneadas ${n} unidad(es) con el código de barras de cada producto. Picking completo.`);
  },
  async box(p, log) {
    const ocupados = new Set((await pedidos()).filter((x) => x.box && x.id !== p.id && !['delivered', 'cancelled'].includes(x.entrega)).map((x) => x.box));
    let box = p.box;
    for (let i = 1; !box && i <= 200; i++) if (!ocupados.has(`BOX${i}`)) box = `BOX${i}`;
    const r = await erp('/api/warehouse', { action: 'ready', orderId: p.id, box });
    log.push(`Listo en ${box}${r.alreadyClosed ? ' (ya estaba)' : ''}.`);
  },
  async cobrar(p, log) {
    await erp('/api/warehouse', { action: 'update-order-workflow', orderId: p.id, expectedVersion: p.version, paymentStatus: 'paid', paymentMethod: 'Efectivo', totalAmount: p.items.reduce((s, i) => s + i.qty * (i.unitPrice || 0), 0) });
    log.push('Cobro registrado en efectivo.');
  },
  async reparto(p, log) {
    if (!/env[ií]o/i.test(p.modo)) throw new Error('Este pedido es de retiro: no sale a reparto.');
    if (p.entrega !== 'ready_dispatch') throw new Error('Primero tiene que estar listo en BOX para envío.');
    if (p.pago !== 'paid') throw new Error('El ERP no deja salir un pedido sin cobrar: tocá "Cobrar" antes.');
    await erp('/api/warehouse', { action: 'save-courier-delivery', orderId: p.id, courier: 'ALAN', deliveryDetail: p.domicilio || 'Domicilio del pedido web', deliveryFee: 0, merchandisePaymentMethod: 'Efectivo', deliveryPaymentMethod: 'Efectivo' });
    log.push('Asignado al repartidor ALAN.');
    await erp('/api/warehouse', { action: 'dispatch-courier-order', orderId: p.id });
    log.push('Cargado al repartidor: en reparto.');
  },
  async entregar(p, log) {
    if (/env[ií]o/i.test(p.modo)) {
      if (p.entrega !== 'in_transit') throw new Error('Un envío se entrega después de salir a reparto.');
      await erp('/api/warehouse', { action: 'delivery', record: { orderId: p.id, box: p.box, mode: p.modo, receiver: 'Cliente (prueba)', cashCollected: true, operator: OPERADOR.operator } });
      return log.push('Entregado al cliente por el repartidor.');
    }
    await erp('/api/warehouse', { action: 'confirm-paid-handover', orderId: p.id, confirmed: true });
    log.push('Entregado en mostrador.');
  },
  async cancelar(p, log) {
    const r = await erp('/api/warehouse', { action: 'cancel-order', orderId: p.id, approverPin: OPERADOR.pin, reason: 'Panel de pruebas' });
    log.push(r.pendingReturn
      ? 'Cancelación interna en reparto: el repartidor tiene que volver al local. Cuando llegue, tocá "Volvió al local".'
      : 'Pedido cancelado.');
  },
  async devolucion(p, log) {
    const d = await erp('/api/warehouse?scope=admin');
    const tarea = (d.tasks || []).find((t) => t.status === 'pending' && new RegExp(`^Cancelación (web|interna) en reparto #${p.id}$`).test(t.title));
    if (!tarea) throw new Error('Este pedido no tiene una cancelación en reparto pendiente.');
    await erp('/api/warehouse', { action: 'complete-task', id: tarea.id, resolution: 'Mercadería recibida en el local (panel de pruebas)', deliveryResolution: 'return' });
    log.push('Mercadería recibida: pedido cancelado, stock a reponer y aviso a la web.');
  },
};
// Combinaciones de pasos (cada paso relee el pedido para usar la versión actual).
const RECORRIDOS = {
  'hasta-box': ['confirmar', 'escanear', 'box'],
  'escanear-y-box': ['escanear', 'box'],
  'cobrar-y-entregar': ['cobrar', 'entregar'],
  'cobrar-y-reparto': ['cobrar', 'reparto'],
};

async function accion(id, nombre) {
  await verificarEntorno();
  const lista = RECORRIDOS[nombre] || (pasos[nombre] ? [nombre] : null);
  if (!lista) throw new Error('Acción desconocida.');
  const log = [];
  for (const paso of lista) await pasos[paso](await pedido(id), log);
  return log;
}

const html = readFileSync(new URL('./panel.html', import.meta.url), 'utf8');
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
    // Solo se usa desde esta Mac: se rechaza cualquier otro origen.
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${PUERTO}` && req.headers.origin !== `http://localhost:${PUERTO}`) return json(res, 403, { error: 'Origen no permitido.' });
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
    if (req.method === 'GET' && url.pathname === '/api/pedidos') { await verificarEntorno(); return json(res, 200, { pedidos: await pedidos() }); }
    if (req.method === 'POST' && url.pathname === '/api/importar') {
      await verificarEntorno();
      const r = await erp('/api/tiendanube', { action: 'import-orders' });
      const c = r.cancellations || {};
      return json(res, 200, { log: [`Pedidos web importados: ${r.imported} nuevos, ${r.skipped} ya existentes.`, `Cancelaciones web revisadas: ${c.checked ?? 0} pedido(s), ${c.cancelled ?? 0} cancelado(s) en el ERP.`] });
    }
    if (req.method === 'POST' && url.pathname === '/api/catalogo') {
      await verificarEntorno();
      const r = await erp('/api/tiendanube', { action: 'import-product-catalog' });
      return json(res, 200, { log: [`Catálogo sincronizado desde la tienda demo. ${r.message || ''}`.trim()] });
    }
    const m = url.pathname.match(/^\/api\/pedido\/([\w-]{1,40})\/([a-z-]{3,20})$/);
    if (req.method === 'POST' && m) return json(res, 200, { log: await accion(m[1], m[2]) });
    json(res, 404, { error: 'No encontrado.' });
  } catch (e) {
    json(res, 409, { error: e instanceof Error ? e.message : 'Error' });
  }
}).listen(PUERTO, '127.0.0.1', () => console.log(`Panel de pruebas en http://127.0.0.1:${PUERTO} (ERP de prueba: ${ERP})`));
