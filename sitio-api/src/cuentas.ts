// Cuentas de clientes: "Continuar con Google" y "Mis pedidos". Sin contraseñas.
// Google devuelve un token firmado (JWT); acá se verifica la firma con las claves públicas de Google,
// el emisor, el destinatario (nuestro ID de cliente) y el vencimiento. Solo e-mails verificados.
import type { D1 } from './sesion.ts';
import type { PedidoValido } from './pedido.ts';

const EMISORES = ['accounts.google.com', 'https://accounts.google.com'];
const CLAVES_GOOGLE = 'https://www.googleapis.com/oauth2/v3/certs';

// Claves públicas de Google en memoria (se renuevan cada hora o si aparece una clave nueva).
let claves: { hasta: number; porKid: Map<string, JsonWebKey> } | null = null;
export function limpiarClavesGoogle() { claves = null; }

async function claveGoogle(kid: string, ahora: number, fetchImpl: typeof fetch) {
  if (!claves || claves.hasta < ahora || !claves.porKid.has(kid)) {
    const r = await fetchImpl(CLAVES_GOOGLE);
    if (!r.ok) throw new Error('No se pudieron leer las claves de Google.');
    const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
    claves = { hasta: ahora + 60 * 60_000, porKid: new Map(keys.map((k) => [k.kid, k])) };
  }
  return claves.porKid.get(kid) || null;
}

const desdeBase64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const jsonBase64url = (s: string) => JSON.parse(new TextDecoder().decode(desdeBase64url(s)));

export type DatosGoogle = { sub: string; email: string; nombre: string };

// Devuelve los datos del cliente o null si el token no es válido (nunca el motivo, para no dar pistas).
export async function verificarTokenGoogle(token: unknown, clientId: string, ahora: number, fetchImpl: typeof fetch): Promise<DatosGoogle | null> {
  if (!clientId || typeof token !== 'string' || token.length > 4096) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  let cabecera: any, datos: any;
  try { cabecera = jsonBase64url(partes[0]); datos = jsonBase64url(partes[1]); } catch { return null; }
  if (cabecera?.alg !== 'RS256' || typeof cabecera.kid !== 'string') return null;
  const jwk = await claveGoogle(cabecera.kid, ahora, fetchImpl);
  if (!jwk) return null;
  const clave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  let firma: Uint8Array;
  try { firma = desdeBase64url(partes[2]); } catch { return null; }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, firma, new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  if (!ok) return null;
  const seg = ahora / 1000;
  if (!EMISORES.includes(datos.iss) || datos.aud !== clientId) return null;
  if (typeof datos.exp !== 'number' || datos.exp < seg - 60) return null;
  if (typeof datos.iat === 'number' && datos.iat > seg + 300) return null;
  if (datos.email_verified !== true || typeof datos.email !== 'string' || typeof datos.sub !== 'string') return null;
  const nombre = String(datos.name || datos.given_name || '').replace(/[<>"'`\u0000-\u001f]/g, '').trim().slice(0, 80);
  return { sub: datos.sub.slice(0, 64), email: datos.email.toLowerCase().slice(0, 200), nombre };
}

// Busca la cuenta por la identidad de Google; si no, por e-mail (cuenta de antes); si no, la crea.
export async function clienteDesdeGoogle(db: D1, g: DatosGoogle, ahora: number): Promise<number> {
  const porSub = await db.prepare('SELECT id FROM clientes WHERE google_sub = ?').bind(g.sub).first<{ id: number }>();
  if (porSub) {
    await db.prepare("UPDATE clientes SET email = ?, email_verificado = 1, nombre = CASE WHEN nombre = '' THEN ? ELSE nombre END, actualizado = ? WHERE id = ?")
      .bind(g.email, g.nombre, ahora, porSub.id).run();
    return porSub.id;
  }
  const porEmail = await db.prepare('SELECT id FROM clientes WHERE email = ?').bind(g.email).first<{ id: number }>();
  if (porEmail) {
    await db.prepare("UPDATE clientes SET google_sub = ?, email_verificado = 1, nombre = CASE WHEN nombre = '' THEN ? ELSE nombre END, actualizado = ? WHERE id = ?")
      .bind(g.sub, g.nombre, ahora, porEmail.id).run();
    return porEmail.id;
  }
  const r = await db.prepare('INSERT INTO clientes (email, email_verificado, nombre, google_sub, creado, actualizado) VALUES (?, 1, ?, ?, ?, ?) RETURNING id')
    .bind(g.email, g.nombre, g.sub, ahora, ahora).first<{ id: number }>();
  return r!.id;
}

// Suma a la cuenta un pedido (de este dispositivo o recién hecho). Un pedido de otra cuenta no se toca.
export async function vincularPedido(db: D1, clienteId: number, pedidoId: number, numero: number, ahora: number) {
  const r = await db.prepare('INSERT OR IGNORE INTO pedidos_cliente (pedido_id, cliente_id, numero, creado) VALUES (?, ?, ?, ?)')
    .bind(pedidoId, clienteId, numero, ahora).run();
  return r.meta.changes > 0 ? 1 : 0;
}

export async function pedidosDelCliente(db: D1, clienteId: number, limite = 30) {
  const { results } = await db.prepare('SELECT pedido_id, numero FROM pedidos_cliente WHERE cliente_id = ? ORDER BY pedido_id DESC LIMIT ?')
    .bind(clienteId, limite).all<{ pedido_id: number; numero: number }>();
  return results;
}

// ---------- Enlace con Tiendanube (tienda demo) ----------
type Api = (path: string, init?: RequestInit) => Promise<any>;

// Busca la ficha del cliente en Tiendanube por e-mail; si no existe, la crea (sin mail de invitación).
// Con la ficha creada antes del pedido, Tiendanube enlaza solo el pedido al cliente por el e-mail.
export async function enlazarClienteTiendanube(db: D1, api: Api, clienteId: number, ahora: number): Promise<number | null> {
  const c = await db.prepare('SELECT email, nombre, tiendanube_id FROM clientes WHERE id = ?').bind(clienteId).first<{ email: string; nombre: string; tiendanube_id: number | null }>();
  if (!c) return null;
  if (c.tiendanube_id) return c.tiendanube_id;
  const encontrados = await api(`/customers?email=${encodeURIComponent(c.email)}&fields=id`);
  let id = Array.isArray(encontrados) && encontrados[0]?.id ? Number(encontrados[0].id) : 0;
  if (!id) {
    const creado = await api('/customers', { method: 'POST', body: JSON.stringify({ name: c.nombre || c.email.split('@')[0], email: c.email, send_email_invite: false }) });
    id = Number(creado?.id) || 0;
  }
  if (!id) return null;
  await db.prepare('UPDATE clientes SET tiendanube_id = ?, actualizado = ? WHERE id = ?').bind(id, ahora, clienteId).run();
  return id;
}

// Suma a la cuenta los pedidos anteriores hechos con el mismo e-mail (verificado por Google).
// Solo coincidencia exacta del e-mail; un pedido que ya es de otra cuenta no se toca.
export async function sumarPedidosAnteriores(db: D1, api: Api, clienteId: number, email: string, ahora: number) {
  const pedidos = await api(`/orders?q=${encodeURIComponent(email)}&status=any&per_page=50&fields=id,number,contact_email,customer`);
  if (!Array.isArray(pedidos)) return 0;
  let n = 0;
  for (const o of pedidos) {
    const de = String(o.contact_email || o.customer?.email || '').toLowerCase();
    if (de !== email.toLowerCase() || !o.id) continue;
    n += await vincularPedido(db, clienteId, Number(o.id), Number(o.number) || 0, ahora);
  }
  return n;
}

// ---------- Datos del último pedido (para completar el checkout) ----------
export async function guardarDatosPedido(db: D1, clienteId: number, p: PedidoValido, ahora: number) {
  const datos = { nombre: p.cliente.nombre, telefono: p.cliente.telefono.replace(/^54/, ''), entrega: p.entrega, pago: p.pago };
  await db.prepare('UPDATE clientes SET datos_pedido = ?, telefono = ?, actualizado = ? WHERE id = ?').bind(JSON.stringify(datos), p.cliente.telefono, ahora, clienteId).run();
}

export function leerDatosPedido(texto: string) {
  try { const d = JSON.parse(texto || ''); return d && typeof d === 'object' ? d : null; } catch { return null; }
}
