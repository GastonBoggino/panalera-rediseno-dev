// Núcleo del panel de pruebas (SOLO DEV): lo usan el panel local (server.mjs) y el panel en línea.
// Mueve pedidos del ERP de prueba sin escanear a mano; escanea como el PDA (una lectura por unidad).
// Antes de cada acción verifica que el ERP esté conectado a la tienda demo "Pañalera Rediseño DEV".
const TIENDA_DEMO = 'Pañalera Rediseño DEV';
// Usuario de los datos de ejemplo de la prueba local (tests/fixtures), no de producción.
const OPERADOR = { operator: 'Samu Pereyra', pin: '3333', device: 'Panel de pruebas' };
const PAUSA_ESCANEO_MS = 250;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// enviar(path, init) habla con el ERP (local: fetch directo; en línea: servicio + contraseña del usuario).
// productos: Map sku → { barcode, name, parts: [{ part, component, componentSku }] }.
// sesion: objeto donde se guarda la cookie del ERP entre pedidos.
export function crearPanel({ enviar, productos: PRODUCTOS, sesion = { cookie: '' } }) {
async function erp(path, body) {
  const intento = async () => enviar(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Cookie: sesion.cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await intento();
  if (r.status === 401) { await login(); r = await intento(); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `El ERP respondió ${r.status}`);
  return data;
}

async function login() {
  const r = await enviar('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(OPERADOR) });
  if (r.status === 401 && !(await r.clone().text()).includes('{')) throw new Error('Contraseña incorrecta para el ERP de prueba.');
  if (!r.ok) throw new Error('No pude entrar al ERP de prueba con el usuario de ejemplo.');
  sesion.cookie = (r.headers.getSetCookie?.() || [r.headers.get('set-cookie') || '']).map((c) => c.split(';')[0]).join('; ');
}

// Candado: solo se trabaja si el ERP de prueba está conectado a la tienda demo.
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


async function importar() {
  await verificarEntorno();
  const r = await erp('/api/tiendanube', { action: 'import-orders' });
  const c = r.cancellations || {};
  return [`Pedidos web importados: ${r.imported} nuevos, ${r.skipped} ya existentes.`, `Cancelaciones web revisadas: ${c.checked ?? 0} pedido(s), ${c.cancelled ?? 0} cancelado(s) en el ERP.`];
}
// El ERP sincroniza el catálogo por partes: se repite hasta terminar (como el botón del ERP).
async function catalogo() {
  await verificarEntorno();
  let r = {}, syncId = '', vueltas = 0;
  do {
    r = await erp('/api/tiendanube', { action: 'import-product-catalog', syncId, full: true });
    syncId = r.catalog?.syncId || '';
  } while (r.catalog?.hasMore && ++vueltas < 200);
  const c = r.catalog || {};
  return [`Catálogo sincronizado desde la tienda demo: ${c.created || 0} nuevos, ${c.updated || 0} actualizados, ${c.unchanged || 0} sin cambios${c.operationalCreated ? `, ${c.operationalCreated} incorporados al depósito` : ''}.`];
}
async function listar() { await verificarEntorno(); return pedidos(); }

return { listar, accion, importar, catalogo };
}
