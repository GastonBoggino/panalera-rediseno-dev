import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, limpiarLimites, seguimiento } from '../src/index.ts';
import { limpiarCacheCatalogo, mapearProductos, unidades } from '../src/catalogo.ts';
import { normalizarTelefono, validarPedido } from '../src/pedido.ts';
import { firmarPedido } from '../src/link.ts';
import { tiendanube } from '../src/tiendanube.ts';

const ORIGEN = 'http://localhost:8787';
const env = {
  TIENDANUBE_STORE_ID: '8415696', TIENDANUBE_ACCESS_TOKEN: 'token-de-prueba', ALLOWED_ORIGINS: ORIGEN,
  CLAVE_INTERNA: 'k'.repeat(40), MINIMO_PEDIDO: '50000', LINK_SECRET: 'x'.repeat(40), TURNSTILE_SECRET: 'secreto-turnstile',
};

const productos = [
  { id: 1, published: true, name: { es: 'ESTRELLA PANAL PREMIUM G60' }, handle: { es: 'estrella-g60' }, categories: [{ name: { es: 'Cuidado personal' } }, { name: { es: 'Pañales' } }],
    images: [{ id: 9, src: 'https://img/g60.webp' }], variants: [{ id: 101, price: '23191.00', cost: '19000.00', sku: '7790064004375', values: [], image_id: 9 }] },
  { id: 2, published: true, name: { es: 'JOHNSON & JOHNSON SHAMPOO X200' }, handle: { es: 'jj-shampoo' }, categories: [{ name: { es: 'Hora del Baño' } }],
    images: [], variants: [{ id: 201, price: '4000.00', cost: '3000.00', sku: 'JJ200', values: [] }] },
  { id: 3, published: false, name: { es: 'OCULTO' }, handle: { es: 'oculto' }, categories: [], images: [], variants: [{ id: 301, price: '100.00', sku: 'X', values: [] }] },
];

// Tiendanube simulada: registra cada llamada.
function falsaTiendanube({ turnstile = true, prep = 'UNPACKED' } = {}) {
  const llamadas: { url: string; method: string; body?: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    llamadas.push({ url, method, body });
    const res = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.includes('turnstile')) return res({ success: turnstile });
    if (url.includes('/products?')) return res(url.includes('page=1') ? productos : []);
    if (url.endsWith('/orders') && method === 'POST') return res({ id: 555, number: 102, total: '51000.00' }, 201);
    if (url.includes('/orders/555/fulfillment-orders')) return res([{ id: 'fo', status: prep }]);
    if (url.includes('/orders/555/cancel')) return res({ status: 'cancelled' });
    if (url.includes('/orders/555') && method === 'PUT') return res({});
    if (url.includes('/orders/555')) return res({ id: 555, number: 102, created_at: '2026-10-22', status: 'open', payment_status: 'pending', shipping_status: 'unpacked', owner_note: 'ERP · Cotización enviada · 22/10', total: '51000.00', shipping_option: 'Retiro', products: [{ name: 'G60', quantity: 2, price: '23191.00' }], contact_phone: '+5493415551234' });
    return res({ error: 'no' }, 404);
  }) as unknown as typeof fetch;
  return { llamadas, deps: { fetch: fetchImpl, ahora: () => 1_000_000 } };
}

const pedidoBase = (extra: any = {}) => ({
  turnstile: 'ok', items: [{ variant_id: 101, quantity: 2 }, { variant_id: 201, quantity: 1 }],
  cliente: { nombre: 'Ana Pérez', telefono: '341 15 555-1234' }, entrega: { tipo: 'retiro' }, pago: 'transferencia', ...extra,
});
const post = (body: unknown, origin = ORIGEN) => new Request('http://api/pedido', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify(body) });

test.beforeEach(() => { limpiarCacheCatalogo(); limpiarLimites(); });

test('nunca opera sobre la tienda real ni tiendas fuera de DEV', () => {
  assert.throws(() => tiendanube({ ...env, TIENDANUBE_STORE_ID: '6357775' }), /no permitida/);
  assert.throws(() => tiendanube({ ...env, TIENDANUBE_STORE_ID: '123' }), /no permitida/);
  assert.throws(() => tiendanube({ ...env, TIENDANUBE_STORE_ID: '8413613' }), /no permitida/, 'la vieja tienda "x" ya no se usa');
  assert.doesNotThrow(() => tiendanube({ ...env, TIENDANUBE_STORE_ID: '8415696' }));
});

test('catálogo con el formato de la maqueta, costos solo en el interno y sin productos ocultos', async () => {
  const { deps } = falsaTiendanube();
  const publico: any = await (await handle(new Request('http://api/catalogo', { headers: { Origin: ORIGEN } }), env, deps)).json();
  assert.equal(publico.items.some((i: any) => 'cost' in i), false, 'el catálogo público nunca lleva costos');
  assert.equal((await handle(new Request('http://api/catalogo/interno'), env, deps)).status, 401);
  assert.equal((await handle(new Request('http://api/catalogo/interno', { headers: { Authorization: 'Bearer ' + 'x'.repeat(40) } }), env, deps)).status, 401);
  const r = await handle(new Request('http://api/catalogo/interno', { headers: { Authorization: 'Bearer ' + 'k'.repeat(40) } }), env, deps);
  const data: any = await r.json();
  assert.equal(r.status, 200);
  assert.equal(data.items.length, 2);
  assert.deepEqual(data.items[0], { id: 101, variant_id: 101, cat: 'panales', brand: 'ESTRELLA', name: 'PANAL PREMIUM G60', talle: 'G', units: 60, price: 23191, sku: '7790064004375', img: 'https://img/g60.webp', handle: 'estrella-g60', cost: 19000 });
  assert.equal(data.items[1].brand, 'JOHNSON & JOHNSON');
  assert.equal(data.items[1].cat, 'bano');
  assert.equal(mapearProductos(productos, false)[0].cost, undefined, 'con INCLUIR_COSTOS apagado no sale el costo');
  const sinCategoria = mapearProductos([{ ...productos[0], categories: [] }], true)[0];
  assert.equal(sinCategoria.cat, 'panales', 'sin categoría se deduce por el nombre');
});

test('unidades y teléfonos', () => {
  assert.equal(unidades('PAMPERS DELUXE XG96'), 96);
  assert.equal(unidades('SHAMPOO X 400 ml'), null);
  assert.equal(unidades('OLEO PAEZ X500'), null, 'x500 en un óleo son ml');
  assert.equal(unidades('ALGODON DONCELLA X140'), null, 'x140 en algodón son gramos');
  assert.equal(unidades('SUNNY DESODORANTE X100'), null);
  assert.equal(unidades('KIMBIES TOALLAS HUMEDAS X48'), 48);
  assert.equal(unidades('ALGABO BABY TRAVEL TOALLAS HUMEDAS x6 PAQ X48'), 48);
  assert.equal(unidades('COMODIN INCONT.FUERTE x10'), 10);
  assert.equal(unidades('ESTRELLA PANAL PREMIUM G60'), 60);
  assert.equal(normalizarTelefono('341 15 555-1234'), '543415551234');
  assert.equal(normalizarTelefono('+54 9 341 555 1234'), '543415551234');
  assert.equal(normalizarTelefono('555-1234'), '');
  assert.equal(normalizarTelefono('341 555-0000'), '543415550000', 'no confunde 3-41-5 con un "15"');
  assert.equal(normalizarTelefono('0341 15 555-0000'), '543415550000');
});

test('pedido válido: recalcula con precios del servidor e ignora los del navegador', async () => {
  const { deps, llamadas } = falsaTiendanube();
  const r = await handle(post(pedidoBase({ items: [{ variant_id: 101, quantity: 2, price: 1 }, { variant_id: 201, quantity: 1 }], total: 10 })), env, deps);
  const data: any = await r.json();
  assert.equal(r.status, 201, JSON.stringify(data));
  assert.equal(data.numero, 102);
  assert.equal(data.total, 23191 * 2 + 4000);
  assert.match(data.seguimiento, /^\/pedido\/555\?t=[0-9a-f]{32}$/);
  const orden = llamadas.find((l) => l.method === 'POST' && l.url.endsWith('/orders'))!.body;
  assert.deepEqual(orden.products, [{ variant_id: 101, quantity: 2 }, { variant_id: 201, quantity: 1 }]);
  assert.equal(orden.gateway, 'offline');
  assert.equal(orden.payment_status, 'pending');
  assert.equal(orden.inventory_behaviour, 'bypass');
  assert.equal(orden.send_confirmation_email, false);
  assert.equal(orden.shipping_pickup_type, 'pickup');
  assert.equal(orden.customer.phone, '+543415551234');
  assert.match(orden.customer.email, /@sin-email\.invalid$/);
  assert.match(orden.note, /Transferencia \(\+5%\)/);
  assert.equal(/"cost"\s*:|19000/.test(JSON.stringify(orden)), false, 'el pedido no lleva costos');
});

test('rechaza: mínimo, producto inexistente, sin teléfono, envío incompleto', async () => {
  const casos: [any, number, RegExp][] = [
    [pedidoBase({ items: [{ variant_id: 201, quantity: 1 }] }), 422, /compra mínima/],
    [pedidoBase({ items: [{ variant_id: 999, quantity: 50 }] }), 422, /ya no están disponibles/],
    [pedidoBase({ cliente: { nombre: 'Ana', telefono: '123' } }), 422, /teléfono/],
    [pedidoBase({ entrega: { tipo: 'envio', calle: 'Mitre' } }), 422, /completá calle/],
    [pedidoBase({ items: [{ variant_id: 101, quantity: 0 }] }), 422, /cantidad inválida/],
  ];
  for (const [body, status, msg] of casos) {
    limpiarLimites();
    const { deps, llamadas } = falsaTiendanube();
    const r = await handle(post(body), env, deps);
    const data: any = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    assert.match(data.errores.join(' '), msg);
    assert.equal(llamadas.some((l) => l.method === 'POST' && l.url.endsWith('/orders')), false, 'no crea pedidos inválidos');
  }
});

test('envío completo arma la dirección y el tipo "ship"', () => {
  const v = validarPedido(pedidoBase({ entrega: { tipo: 'envio', zona: 'expreso', calle: 'Mitre', numero: '1500', ciudad: 'Venado Tuerto', provincia: 'Santa Fe', cp: '2600' } }));
  assert.equal(v.ok, true);
});

test('protecciones: origen, robots, campo trampa y límite por IP', async () => {
  let { deps, llamadas } = falsaTiendanube();
  assert.equal((await handle(post(pedidoBase(), 'https://otro.com'), env, deps)).status, 403);
  ({ deps, llamadas } = falsaTiendanube({ turnstile: false }));
  assert.equal((await handle(post(pedidoBase()), env, deps)).status, 400);
  ({ deps, llamadas } = falsaTiendanube());
  assert.equal((await handle(post(pedidoBase({ empresa_web: 'spam' })), env, deps)).status, 422);
  limpiarLimites();
  const estados = [];
  for (let i = 0; i < 6; i++) estados.push((await handle(post(pedidoBase({ cliente: { nombre: 'Ana', telefono: `341555000${i}` } })), env, deps)).status);
  assert.deepEqual(estados, [201, 201, 201, 201, 201, 429]);
  assert.equal(llamadas.filter((l) => l.method === 'POST' && l.url.endsWith('/orders')).length, 5);
});

test('seguimiento: solo con link firmado y sin datos personales', async () => {
  const { deps } = falsaTiendanube();
  const t = await firmarPedido(555, env.LINK_SECRET);
  const ok = await handle(new Request(`http://api/pedido/555?t=${t}`), env, deps);
  const data: any = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(data.etapa, 'en_revision');
  assert.equal(JSON.stringify(data).includes('5551234'), false, 'no devuelve el teléfono');
  assert.equal((await handle(new Request(`http://api/pedido/555?t=${'0'.repeat(32)}`), env, deps)).status, 404);
  assert.equal((await handle(new Request('http://api/pedido/556?t=' + t), env, deps)).status, 404, 'el link de un pedido no abre otro');
});

test('etapas de seguimiento', () => {
  assert.equal(seguimiento({ status: 'open', shipping_status: 'unpacked', owner_note: '' }).etapa, 'recibido');
  assert.equal(seguimiento({ status: 'open', shipping_status: 'unpacked', owner_note: 'ERP · Confirmado por el cliente' }).etapa, 'confirmado');
  assert.equal(seguimiento({ status: 'open', shipping_status: 'packed' }).etapa, 'listo');
  assert.equal(seguimiento({ status: 'open', shipping_status: 'shipped' }).etapa, 'en_camino');
  assert.equal(seguimiento({ status: 'closed', shipping_status: 'delivered' }).etapa, 'entregado');
  assert.equal(seguimiento({ status: 'cancelled' }).etapa, 'cancelado');
  assert.equal(seguimiento({ status: 'open', shipping_status: 'unpacked', owner_note: 'ERP · Confirmado' }, 'IN_PREPARATION').etapa, 'preparando');
  assert.equal(seguimiento({ status: 'open', shipping_status: 'unpacked' }, 'READY_FOR_PICKUP').etapa, 'listo');
  assert.equal(seguimiento({ status: 'closed' }, 'DELIVERED').etapa, 'entregado');
  assert.equal(seguimiento({ status: 'cancelled' }, 'IN_PREPARATION').etapa, 'cancelado', 'la cancelación manda');
  assert.equal(seguimiento({ status: 'open', payment_status: 'pending', owner_note: 'ERP · Cobro registrado · 22/10' }).pago, 'pagado');
  const enCamino = seguimiento({ status: 'cancelled', owner_note: 'ERP · Cobro registrado' }, 'DISPATCHED');
  assert.equal(enCamino.pago, 'reintegro');
  assert.equal(enCamino.canceladoEnCamino, true);
  assert.equal(seguimiento({ status: 'cancelled' }, 'UNPACKED').canceladoEnCamino, false);
});

test('botón de arrepentimiento: cancela si no se empezó a preparar; si no, solo registra el pedido', async () => {
  const t = await firmarPedido(555, env.LINK_SECRET);
  const pedir = (deps: any) => handle(new Request(`http://api/pedido/555/cancelacion?t=${t}`, { method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: 'Me equivoqué' }) }), env, deps);
  let f = falsaTiendanube();
  let r: any = await (await pedir(f.deps)).json();
  assert.equal(r.resultado, 'cancelado');
  assert.ok(f.llamadas.some((l) => l.url.endsWith('/orders/555/cancel') && l.body.email === false && l.body.restock === false));
  limpiarLimites();
  f = falsaTiendanube({ prep: 'DISPATCHED' });
  const enCamino = await pedir(f.deps);
  assert.equal(enCamino.status, 409, 'en camino no se puede cancelar desde la web');
  assert.match((await enCamino.json() as any).errores[0], /ya está en camino/);
  assert.equal(f.llamadas.some((l) => l.url.endsWith('/cancel') || l.method === 'PUT'), false);
  limpiarLimites();
  f = falsaTiendanube({ prep: 'READY_FOR_PICKUP' });
  r = await (await pedir(f.deps)).json();
  assert.equal(r.resultado, 'solicitado');
  assert.equal(f.llamadas.some((l) => l.url.endsWith('/cancel')), false, 'preparado: solo se registra el pedido');
  const put = f.llamadas.find((l) => l.method === 'PUT')!;
  assert.match(put.body.owner_note, /ERP · Cotización enviada[\s\S]*\nWEB · Pedido de cancelación del cliente .*Motivo: Me equivoqué/);
  limpiarLimites();
  assert.equal((await handle(new Request(`http://api/pedido/555/cancelacion?t=${'0'.repeat(32)}`, { method: 'POST', headers: { Origin: ORIGEN } }), env, f.deps)).status, 404);
  assert.equal(seguimiento({ status: 'open', owner_note: 'WEB · Pedido de cancelación del cliente' }).cancelacionSolicitada, true);
  assert.equal(seguimiento({ status: 'open', owner_note: 'ERP · Cancelación en curso: el pedido vuelve al local' }, 'DISPATCHED').cancelacionEnCurso, true);
});

test('seguridad: nombres sin HTML, imágenes solo https, costos fuera si están apagados', async () => {
  const malo = [{ id: 9, published: true, name: { es: 'HUGGIES <img src=x onerror=alert(1)> G60' }, handle: { es: 'h"x' }, categories: [], images: [{ id: 1, src: 'javascript:alert(1)' }],
    variants: [{ id: 901, price: '100', cost: '50', sku: 'S', values: [], image_id: 1 }] }];
  const it = mapearProductos(malo, true)[0];
  assert.equal(/[<>"']/.test(it.brand + it.name + it.handle), false);
  assert.equal(it.img, '');
  const { cargarCatalogo } = await import('../src/catalogo.ts');
  limpiarCacheCatalogo();
  const api = async () => productos;
  const conCostos = await cargarCatalogo(api as any, true, 1);
  const sinCostos = await cargarCatalogo(api as any, false, 2);
  assert.ok(conCostos[0].cost);
  assert.equal(sinCostos.some((i: any) => 'cost' in i), false, 'sin costos aunque la caché los tenga');
});

test('arrepentimiento con el pedido ya cobrado: no cancela solo, registra el pedido', async () => {
  const t = await firmarPedido(555, env.LINK_SECRET);
  const f = falsaTiendanube();
  const fetchCobrado = (async (url: string, init: RequestInit = {}) => {
    if (String(url).includes('/orders/555?fields=')) return new Response(JSON.stringify({ id: 555, status: 'open', payment_status: 'pending', owner_note: 'ERP · Cobro registrado' }));
    return (f.deps.fetch as any)(url, init);
  }) as unknown as typeof fetch;
  const r: any = await (await handle(new Request(`http://api/pedido/555/cancelacion?t=${t}`, { method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json' }, body: '{}' }), env, { fetch: fetchCobrado, ahora: () => 5 })).json();
  assert.equal(r.resultado, 'solicitado');
  assert.equal(f.llamadas.some((l) => l.url.endsWith('/cancel')), false);
});
