import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle } from '../src/index.ts';
import { enviarMensaje, leerBuzon } from '../src/buzon.ts';
import { COOKIE, DURACION, crearSesion, huella, leerSesion, type D1 } from '../src/sesion.ts';

// Base de prueba: SQLite de Node con la misma migración que la base del sitio (D1).
function baseDePrueba() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const m of ['0001_cuentas.sql', '0002_datos_pedido.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${m}`, import.meta.url), 'utf8'));
  const db: D1 = {
    prepare: (sql) => ({
      bind: (...v: any[]) => ({
        first: async () => (sqlite.prepare(sql).get(...v) as any) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...v) as any[] }),
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...v).changes) } }),
      }),
    }),
  };
  const cliente = (email = 'ana.prueba@example.com') =>
    Number(sqlite.prepare("INSERT INTO clientes (email, email_verificado, nombre, creado, actualizado) VALUES (?, 1, 'Ana Prueba', 0, 0)").run(email).lastInsertRowid);
  return { sqlite, db, cliente };
}

const ORIGEN = 'http://localhost:8787';
const AHORA = 1_800_000_000_000;
const envBase = { TIENDANUBE_STORE_ID: '8415696', TIENDANUBE_ACCESS_TOKEN: 't', ALLOWED_ORIGINS: ORIGEN, CLAVE_INTERNA: 'k'.repeat(40), LINK_SECRET: 'x'.repeat(40) };
const deps = (ahora = AHORA) => ({ fetch: (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch, ahora: () => ahora });
const conCookie = (token: string, url = 'http://api/sesion', init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { Origin: ORIGEN, Cookie: `otra=1; ${COOKIE}=${token}`, ...(init.headers || {}) } });

test('la sesión guarda solo la huella del token y la cookie es segura', async () => {
  const { sqlite, db, cliente } = baseDePrueba();
  const id = cliente();
  const token = await crearSesion(db, id, AHORA, 'Chrome');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const filas = sqlite.prepare('SELECT huella, vence FROM sesiones').all() as any[];
  assert.equal(filas.length, 1);
  assert.notEqual(filas[0].huella, token, 'el token nunca se guarda en claro');
  assert.equal(filas[0].huella, await huella(token));
  assert.equal(filas[0].vence, AHORA + DURACION);

  const res = await handle(conCookie(token), { ...envBase, DB: db, GOOGLE_CLIENT_ID: 'cliente-dev' }, deps());
  assert.deepEqual(await res.json(), { cliente: { nombre: 'Ana Prueba', email: 'ana.prueba@example.com', datos: null }, cuentas: true, googleClientId: 'cliente-dev' });
  assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGEN);
});

test('sin cookie, con token falso o vencido: sin sesión', async () => {
  const { db, cliente } = baseDePrueba();
  const token = await crearSesion(db, cliente(), AHORA);
  const env = { ...envBase, DB: db };
  for (const req of [new Request('http://api/sesion', { headers: { Origin: ORIGEN } }), conCookie('A'.repeat(43)), conCookie(token.slice(0, 20))]) {
    assert.equal(((await (await handle(req, env, deps())).json()) as any).cliente, null);
  }
  assert.equal((await leerSesion(db, conCookie(token), AHORA + DURACION)).cliente, null, 'a los 90 días vence');
});

test('se renueva sola si quedan menos de 60 días (el cliente activo no vuelve a entrar)', async () => {
  const { sqlite, db, cliente } = baseDePrueba();
  const token = await crearSesion(db, cliente(), AHORA);
  const dia = 24 * 60 * 60_000;
  assert.equal((await leerSesion(db, conCookie(token), AHORA + 10 * dia)).renovada, undefined);
  const r = await leerSesion(db, conCookie(token), AHORA + 40 * dia);
  assert.match(r.renovada || '', new RegExp(`^${COOKIE}=${token}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax$`));
  assert.equal((sqlite.prepare('SELECT vence FROM sesiones').get() as any).vence, AHORA + 40 * dia + DURACION);
});

test('cerrar sesión y cerrar en todos los dispositivos', async () => {
  const { sqlite, db, cliente } = baseDePrueba();
  const ana = cliente(), otro = cliente('otro@example.com');
  const t1 = await crearSesion(db, ana, AHORA), t2 = await crearSesion(db, ana, AHORA), t3 = await crearSesion(db, otro, AHORA);
  const env = { ...envBase, DB: db };
  const cerrar = (t: string, ruta: string, origin = ORIGEN) => handle(conCookie(t, `http://api${ruta}`, { method: 'POST', headers: { Origin: origin } }), env, deps());

  assert.equal((await cerrar(t1, '/sesion/cerrar', 'https://otro.sitio')).status, 403, 'solo desde el sitio');
  const r = await cerrar(t1, '/sesion/cerrar');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Set-Cookie') || '', new RegExp(`^${COOKIE}=; Path=/; Max-Age=0`));
  assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM sesiones').get() as any).n, 2);

  assert.equal((await cerrar(t1, '/sesion/cerrar-todas')).status, 401, 'con la sesión ya cerrada no puede cerrar las demás');
  assert.equal((await cerrar(t2, '/sesion/cerrar-todas')).status, 200);
  assert.deepEqual(sqlite.prepare('SELECT cliente_id FROM sesiones').all().map((f: any) => f.cliente_id), [otro], 'las de otro cliente siguen');
  assert.equal(((await (await handle(conCookie(t3), env, deps())).json()) as any).cliente.email, 'otro@example.com');
});

test('sin base configurada el sitio sigue funcionando sin cuentas', async () => {
  const res = await handle(new Request('http://api/sesion', { headers: { Origin: ORIGEN } }), envBase, deps());
  assert.deepEqual(await res.json(), { cliente: null, cuentas: false });
});

test('buzón de pruebas: guarda sin enviar y solo se lee con la clave interna', async () => {
  const { db } = baseDePrueba();
  await enviarMensaje(db, { canal: 'whatsapp', destino: '5493415550101', cuerpo: 'Recibimos tu pedido #130\u0000' }, AHORA);
  await enviarMensaje(db, { canal: 'email', destino: 'ana.prueba@example.com', asunto: 'Tu pedido', cuerpo: 'Link' }, AHORA + 1);
  await assert.rejects(enviarMensaje(db, { canal: 'sms' as any, destino: 'x', cuerpo: 'x' }, AHORA), /Canal/);
  const env = { ...envBase, DB: db };
  assert.equal((await handle(new Request('http://api/buzon'), env, deps())).status, 401);
  assert.equal((await handle(new Request('http://api/buzon', { headers: { Authorization: 'Bearer ' + 'm'.repeat(40) } }), env, deps())).status, 401);
  const res: any = await (await handle(new Request('http://api/buzon', { headers: { Authorization: 'Bearer ' + 'k'.repeat(40) } }), env, deps())).json();
  assert.deepEqual(res.mensajes.map((m: any) => [m.canal, m.cuerpo]), [['email', 'Link'], ['whatsapp', 'Recibimos tu pedido #130']]);
  for (let i = 0; i < 205; i++) await enviarMensaje(db, { canal: 'email', destino: 'a@example.com', cuerpo: String(i) }, AHORA);
  assert.equal((await leerBuzon(db, 500)).length, 200, 'guarda solo los últimos 200');
});

// ---------- Continuar con Google ----------
import { limpiarClavesGoogle } from '../src/cuentas.ts';
import { firmarPedido } from '../src/link.ts';

const CLIENT_ID = 'cliente-dev.apps.googleusercontent.com';
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
// Par de claves propio que hace de "Google" en las pruebas.
const parGoogle = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const otroPar = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwkPublica = { ...(await crypto.subtle.exportKey('jwk', parGoogle.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
async function tokenGoogle(datos: Record<string, unknown>, { clave = parGoogle.privateKey, kid = 'k1' } = {}) {
  const seg = Math.floor(AHORA / 1000);
  const cab = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const cuerpo = b64url(new TextEncoder().encode(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-123', email: 'Ana.Prueba@example.com', email_verified: true, name: 'Ana <b>Prueba</b>', iat: seg, exp: seg + 3600, ...datos })));
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(`${cab}.${cuerpo}`));
  return `${cab}.${cuerpo}.${b64url(firma)}`;
}

// Google y Tiendanube simulados.
function depsGoogle() {
  const llamadas: string[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    llamadas.push(`${init.method || 'GET'} ${url}`);
    const res = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
    if (url.includes('googleapis.com/oauth2/v3/certs')) return res({ keys: [jwkPublica] });
    if (url.includes('turnstile')) return res({ success: true });
    if (url.includes('/products?')) return res(url.includes('page=1') ? [{ id: 1, published: true, name: { es: 'ESTRELLA PANAL PREMIUM G60' }, handle: { es: 'g60' }, categories: [{ name: { es: 'Pañales' } }], images: [], variants: [{ id: 101, price: '30000.00', sku: 'G60', values: [] }] }] : []);
    if (url.endsWith('/orders') && init.method === 'POST') return res({ id: 9001, number: 140 }, 201);
    const m = url.match(/\/orders\/(\d+)\?/);
    if (m) return res({ id: Number(m[1]), number: Number(m[1]) - 8860, created_at: '2026-10-25', status: 'open', payment_status: 'pending', shipping_status: 'unpacked', owner_note: 'ERP · Confirmado', total: '60000.00', shipping_option: 'Retiro' });
    return res({}, 404);
  }) as unknown as typeof fetch;
  return { llamadas, deps: { fetch: fetchImpl, ahora: () => AHORA } };
}
const entrar = (credential: unknown, extra: Record<string, unknown> = {}, origin = ORIGEN) =>
  new Request('http://api/sesion/google', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify({ credential, ...extra }) });
const cookieDe = (res: Response) => (res.headers.get('Set-Cookie') || '').match(new RegExp(`${COOKIE}=([A-Za-z0-9_-]{43})`))?.[1] || '';

test('Continuar con Google: crea la cuenta, abre la sesión y suma los pedidos firmados de este dispositivo', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { sqlite, db } = baseDePrueba();
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID };
  const { deps: d } = depsGoogle();
  const pedidos = [{ id: '9000', t: await firmarPedido(9000, envBase.LINK_SECRET), numero: 139 }, { id: '9002', t: 'f'.repeat(32) }];
  const res = await handle(entrar(await tokenGoogle({}), { pedidos }), env, d);
  assert.equal(res.status, 200);
  const data: any = await res.json();
  assert.deepEqual(data, { cliente: { nombre: 'Ana bPrueba/b', email: 'ana.prueba@example.com' }, sumados: 1 }, 'nombre sin HTML, e-mail en minúsculas, solo el pedido con firma válida');
  assert.match(res.headers.get('Set-Cookie') || '', /HttpOnly; Secure; SameSite=Lax/);
  assert.deepEqual(sqlite.prepare('SELECT pedido_id, numero FROM pedidos_cliente').all().map((f: any) => [f.pedido_id, f.numero]), [[9000, 139]]);

  // Con la sesión: "Mis pedidos" con link firmado para abrir cada uno.
  const mis: any = await (await handle(conCookie(cookieDe(res), 'http://api/mis-pedidos'), env, d)).json();
  assert.deepEqual(mis.pedidos, [{ id: '9000', t: await firmarPedido(9000, envBase.LINK_SECRET), numero: 140, fecha: '2026-10-25', etapa: 'confirmado', pago: 'pendiente', total: 60000, entrega: 'Retiro' }]);
  assert.equal((await handle(new Request('http://api/mis-pedidos', { headers: { Origin: ORIGEN } }), env, d)).status, 401, 'sin sesión no hay lista');

  // Volver a entrar no duplica la cuenta.
  await handle(entrar(await tokenGoogle({})), env, d);
  assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM clientes').get() as any).n, 1);
});

test('Continuar con Google: rechaza tokens falsos, vencidos, de otra app o con e-mail sin verificar', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { sqlite, db } = baseDePrueba();
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID };
  const { deps: d } = depsGoogle();
  const malos = [
    await tokenGoogle({ aud: 'otra-app.apps.googleusercontent.com' }),
    await tokenGoogle({ iss: 'https://evil.example' }),
    await tokenGoogle({ exp: Math.floor(AHORA / 1000) - 3600 }),
    await tokenGoogle({ email_verified: false }),
    await tokenGoogle({}, { clave: otroPar.privateKey }),
    await tokenGoogle({}, { kid: 'desconocida' }),
    (await tokenGoogle({})).replace(/\.[^.]+\./, `.${b64url(new TextEncoder().encode(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'otro', email: 'x@example.com', email_verified: true, exp: 9e9 })))}.`),
    'no-es-un-token', 123,
  ];
  for (const t of malos) assert.equal((await handle(entrar(t), env, d)).status, 401, String(t).slice(0, 40));
  assert.equal((await handle(entrar(await tokenGoogle({}), {}, 'https://otro.sitio'), env, d)).status, 403, 'solo desde el sitio');
  assert.equal((await handle(entrar(await tokenGoogle({})), { ...env, GOOGLE_CLIENT_ID: '' }, d)).status, 503, 'sin ID de Google no hay cuentas');
  assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM clientes').get() as any).n, 0);
});

test('Google se suma a una cuenta existente con el mismo e-mail, y no se roban pedidos de otra cuenta', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { sqlite, db, cliente } = baseDePrueba();
  const ana = cliente('ana.prueba@example.com'), otro = cliente('otro@example.com');
  sqlite.prepare('INSERT INTO pedidos_cliente (pedido_id, cliente_id, numero, creado) VALUES (9000, ?, 139, 0)').run(otro);
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID };
  const { deps: d } = depsGoogle();
  const res = await handle(entrar(await tokenGoogle({}), { pedidos: [{ id: '9000', t: await firmarPedido(9000, envBase.LINK_SECRET) }] }), env, d);
  assert.equal(res.status, 200);
  assert.equal((sqlite.prepare('SELECT google_sub FROM clientes WHERE id = ?').get(ana) as any).google_sub, 'g-123');
  assert.equal((sqlite.prepare('SELECT cliente_id FROM pedidos_cliente WHERE pedido_id = 9000').get() as any).cliente_id, otro);
});

test('pedido hecho con la sesión iniciada queda en "Mis pedidos"; sin sesión, no', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { limpiarCacheCatalogo } = await import('../src/catalogo.ts'); limpiarCacheCatalogo();
  const { sqlite, db, cliente } = baseDePrueba();
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID, TURNSTILE_SECRET: 's', MINIMO_PEDIDO: '50000' };
  const token = await crearSesion(db, cliente(), AHORA);
  const { deps: d } = depsGoogle();
  const cuerpo = JSON.stringify({ turnstile: 'ok', items: [{ variant_id: 101, quantity: 2 }], cliente: { nombre: 'Ana Prueba', telefono: '341 555-0101' }, entrega: { tipo: 'retiro' }, pago: 'efectivo' });
  const pedir = (cookie: string) => new Request('http://api/pedido', { method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json', Cookie: cookie }, body: cuerpo });
  assert.equal((await handle(pedir(''), env, d)).status, 201);
  assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM pedidos_cliente').get() as any).n, 0);
  assert.equal((await handle(pedir(`${COOKIE}=${token}`), env, d)).status, 201);
  assert.deepEqual(sqlite.prepare('SELECT pedido_id, numero FROM pedidos_cliente').all().map((f: any) => [f.pedido_id, f.numero]), [[9001, 140]]);
});

// ---------- Etapa 3: enlace con Tiendanube ----------
function depsTiendanube({ clienteExistente = 0, falla = false, pedidos = [] as any[] } = {}) {
  const llamadas: { metodo: string; url: string; body?: any }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const metodo = init.method || 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    llamadas.push({ metodo, url, body });
    const res = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
    if (url.includes('googleapis.com/oauth2/v3/certs')) return res({ keys: [jwkPublica] });
    if (falla && url.includes('api.tiendanube.com')) return res({ error: 'caída' }, 500);
    if (url.includes('/customers?email=')) return clienteExistente ? res([{ id: clienteExistente }]) : res({ description: 'Last page is 0' }, 404);
    if (url.endsWith('/customers') && metodo === 'POST') return res({ id: 777 }, 201);
    if (url.includes('/orders?q=')) return res(pedidos);
    if (url.includes('turnstile')) return res({ success: true });
    if (url.includes('/products?')) return res(url.includes('page=1') ? [{ id: 1, published: true, name: { es: 'ESTRELLA PANAL PREMIUM G60' }, handle: { es: 'g60' }, categories: [{ name: { es: 'Pañales' } }], images: [], variants: [{ id: 101, price: '30000.00', sku: 'G60', values: [] }] }] : []);
    if (url.endsWith('/orders') && metodo === 'POST') return res({ id: 9100, number: 150 }, 201);
    return res({}, 404);
  }) as unknown as typeof fetch;
  return { llamadas, deps: { fetch: fetchImpl, ahora: () => AHORA } };
}

test('al entrar: crea la ficha en Tiendanube sin mail de invitación (una sola vez) y suma pedidos anteriores con el mismo e-mail', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { sqlite, db, cliente } = baseDePrueba();
  const otro = cliente('otro@example.com');
  sqlite.prepare('INSERT INTO pedidos_cliente (pedido_id, cliente_id, numero, creado) VALUES (5003, ?, 103, 0)').run(otro);
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID };
  const pedidos = [
    { id: 5001, number: 101, contact_email: 'ana.prueba@example.com' },
    { id: 5002, number: 102, contact_email: 'ANA.PRUEBA@example.com' },
    { id: 5004, number: 104, contact_email: 'xana.prueba@example.com' },
    { id: 5003, number: 103, contact_email: 'ana.prueba@example.com' },
  ];
  const t = depsTiendanube({ pedidos });
  const res: any = await (await handle(entrar(await tokenGoogle({})), env, t.deps)).json();
  assert.equal(res.sumados, 2, 'solo coincidencia exacta y sin robar el de otra cuenta');
  const alta = t.llamadas.filter((l) => l.metodo === 'POST' && l.url.endsWith('/customers'));
  assert.equal(alta.length, 1);
  assert.equal(alta[0].body.send_email_invite, false);
  assert.equal(alta[0].body.email, 'ana.prueba@example.com');
  assert.ok(!('password' in alta[0].body), 'nunca se manda contraseña');
  assert.ok(t.llamadas.every((l) => !l.url.includes('api.tiendanube.com') || l.url.includes('/v1/8415696/')), 'solo la tienda demo');
  const ana = sqlite.prepare("SELECT id, tiendanube_id FROM clientes WHERE email = 'ana.prueba@example.com'").get() as any;
  assert.equal(ana.tiendanube_id, 777);
  assert.deepEqual(sqlite.prepare('SELECT pedido_id FROM pedidos_cliente WHERE cliente_id = ? ORDER BY pedido_id').all(ana.id).map((f: any) => f.pedido_id), [5001, 5002]);
  assert.equal((sqlite.prepare('SELECT cliente_id FROM pedidos_cliente WHERE pedido_id = 5003').get() as any).cliente_id, otro);

  const t2 = depsTiendanube({ pedidos });
  await handle(entrar(await tokenGoogle({})), env, t2.deps);
  assert.equal(t2.llamadas.filter((l) => l.url.includes('/customers')).length, 0, 'con la ficha ya enlazada no se vuelve a buscar ni crear');
});

test('si la ficha ya existe en Tiendanube se usa esa; si Tiendanube falla, se entra igual', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { sqlite, db } = baseDePrueba();
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID };
  const t = depsTiendanube({ clienteExistente: 356 });
  assert.equal((await handle(entrar(await tokenGoogle({})), env, t.deps)).status, 200);
  assert.equal(t.llamadas.filter((l) => l.metodo === 'POST' && l.url.endsWith('/customers')).length, 0);
  assert.equal((sqlite.prepare('SELECT tiendanube_id FROM clientes').get() as any).tiendanube_id, 356);

  const b = baseDePrueba();
  const caida = depsTiendanube({ falla: true });
  const r = await handle(entrar(await tokenGoogle({ sub: 'g-999', email: 'beto@example.com' })), { ...env, DB: b.db }, caida.deps);
  assert.equal(r.status, 200);
  assert.ok(cookieDe(r), 'abre la sesión aunque Tiendanube no responda');
  assert.equal((b.sqlite.prepare('SELECT tiendanube_id FROM clientes').get() as any).tiendanube_id, null, 'se reintenta en el próximo ingreso');
});

test('pedido con sesión: sale con el e-mail de la cuenta para que Tiendanube lo enlace a la ficha', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { limpiarCacheCatalogo } = await import('../src/catalogo.ts'); limpiarCacheCatalogo();
  const { sqlite, db, cliente } = baseDePrueba();
  const id = cliente();
  sqlite.prepare('UPDATE clientes SET tiendanube_id = 777 WHERE id = ?').run(id);
  const token = await crearSesion(db, id, AHORA);
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID, TURNSTILE_SECRET: 's', MINIMO_PEDIDO: '50000' };
  const t = depsTiendanube();
  const cuerpo = JSON.stringify({ turnstile: 'ok', items: [{ variant_id: 101, quantity: 2 }], cliente: { nombre: 'Ana Prueba', telefono: '341 555-0101', email: 'otro.mail@example.com' }, entrega: { tipo: 'retiro' }, pago: 'efectivo' });
  const r = await handle(new Request('http://api/pedido', { method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json', Cookie: `${COOKIE}=${token}` }, body: cuerpo }), env, t.deps);
  assert.equal(r.status, 201);
  const pedido = t.llamadas.find((l) => l.metodo === 'POST' && l.url.endsWith('/orders'))!;
  assert.equal(pedido.body.customer.email, 'ana.prueba@example.com');
  assert.deepEqual(sqlite.prepare('SELECT pedido_id FROM pedidos_cliente').all().map((f: any) => f.pedido_id), [9100]);
});

test('pedido con sesión guarda nombre, WhatsApp, dirección, entrega y pago; /sesion se los devuelve solo al dueño', async () => {
  limpiarClavesGoogle(); (await import('../src/index.ts')).limpiarLimites();
  const { limpiarCacheCatalogo } = await import('../src/catalogo.ts'); limpiarCacheCatalogo();
  const { db, cliente } = baseDePrueba();
  const id = cliente();
  const token = await crearSesion(db, id, AHORA), otro = await crearSesion(db, cliente('otro@example.com'), AHORA);
  const env = { ...envBase, DB: db, GOOGLE_CLIENT_ID: CLIENT_ID, TURNSTILE_SECRET: 's', MINIMO_PEDIDO: '50000' };
  const t = depsTiendanube();
  const entrega = { tipo: 'envio', zona: 'rosario', calle: 'Balcarce', numero: '123', piso: '2B', ciudad: 'Rosario', provincia: 'Santa Fe', cp: '2000' };
  const cuerpo = JSON.stringify({ turnstile: 'ok', items: [{ variant_id: 101, quantity: 2 }], cliente: { nombre: 'Ana Comercio', telefono: '0341 15 555-0101' }, entrega, pago: 'transferencia' });
  assert.equal((await handle(new Request('http://api/pedido', { method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json', Cookie: `${COOKIE}=${token}` }, body: cuerpo }), env, t.deps)).status, 201);
  const s: any = await (await handle(conCookie(token), env, t.deps)).json();
  assert.deepEqual(s.cliente.datos, { nombre: 'Ana Comercio', telefono: '3415550101', entrega, pago: 'transferencia' });
  assert.equal(((await (await handle(conCookie(otro), env, t.deps)).json()) as any).cliente.datos, null, 'otro cliente no ve esos datos');
});
