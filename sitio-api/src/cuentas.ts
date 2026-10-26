// Cuentas de clientes: "Continuar con Google" y "Mis pedidos". Sin contraseñas.
// Google devuelve un token firmado (JWT); acá se verifica la firma con las claves públicas de Google,
// el emisor, el destinatario (nuestro ID de cliente) y el vencimiento. Solo e-mails verificados.
import type { D1 } from './sesion.ts';

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
  await db.prepare('INSERT OR IGNORE INTO pedidos_cliente (pedido_id, cliente_id, numero, creado) VALUES (?, ?, ?, ?)')
    .bind(pedidoId, clienteId, numero, ahora).run();
}

export async function pedidosDelCliente(db: D1, clienteId: number, limite = 30) {
  const { results } = await db.prepare('SELECT pedido_id, numero FROM pedidos_cliente WHERE cliente_id = ? ORDER BY pedido_id DESC LIMIT ?')
    .bind(clienteId, limite).all<{ pedido_id: number; numero: number }>();
  return results;
}
