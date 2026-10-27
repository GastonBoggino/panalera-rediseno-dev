// Sesiones de clientes (sin contraseñas): cookie con un token aleatorio de 90 días.
// En la base se guarda solo la huella (SHA-256) del token: una copia de la base no sirve para entrar.

// Lo mínimo de D1 que se usa (así las pruebas pueden usar SQLite de Node).
export type D1 = {
  prepare: (sql: string) => { bind: (...valores: unknown[]) => { first: <T = any>() => Promise<T | null>; all: <T = any>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> } };
};

export const COOKIE = 'pmr_sesion';
const DIA = 24 * 60 * 60_000;
export const DURACION = 90 * DIA;
// Si se usa con menos de 60 días restantes, se renueva a 90 (el cliente activo no vuelve a entrar).
const RENOVAR_SI_QUEDAN = 60 * DIA;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const huella = async (texto: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));

function tokenAleatorio() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function leerCookie(request: Request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})(?:;|$)`));
  return m ? m[1] : '';
}

export function cookieSesion(token: string, maxAgeMs = DURACION) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}
export const cookieBorrada = () => cookieSesion('', 0);

export async function crearSesion(db: D1, clienteId: number, ahora: number, dispositivo = '') {
  const token = tokenAleatorio();
  // Limpieza de vencidas del mismo cliente al entrar.
  await db.prepare('DELETE FROM sesiones WHERE cliente_id = ? AND vence <= ?').bind(clienteId, ahora).run();
  await db.prepare('INSERT INTO sesiones (huella, cliente_id, creada, vence, ultimo_uso, dispositivo) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await huella(token), clienteId, ahora, ahora + DURACION, ahora, dispositivo.slice(0, 120)).run();
  return token;
}

export type Cliente = { id: number; email: string; nombre: string; telefono: string | null; telefono_verificado: number; tiendanube_id: number | null; datos_pedido: string };

// Devuelve el cliente de la sesión (o null) y, si corresponde, la cookie renovada.
export async function leerSesion(db: D1, request: Request, ahora: number): Promise<{ cliente: Cliente | null; renovada?: string }> {
  const token = leerCookie(request);
  if (!token) return { cliente: null };
  const h = await huella(token);
  const fila = await db.prepare(`SELECT s.vence, c.id, c.email, c.nombre, c.telefono, c.telefono_verificado, c.tiendanube_id, c.datos_pedido
    FROM sesiones s JOIN clientes c ON c.id = s.cliente_id WHERE s.huella = ?`).bind(h).first<Cliente & { vence: number }>();
  if (!fila || fila.vence <= ahora) return { cliente: null };
  const { vence, ...cliente } = fila;
  if (vence - ahora < RENOVAR_SI_QUEDAN) {
    await db.prepare('UPDATE sesiones SET vence = ?, ultimo_uso = ? WHERE huella = ?').bind(ahora + DURACION, ahora, h).run();
    return { cliente, renovada: cookieSesion(token) };
  }
  await db.prepare('UPDATE sesiones SET ultimo_uso = ? WHERE huella = ?').bind(ahora, h).run();
  return { cliente };
}

export async function cerrarSesion(db: D1, request: Request) {
  const token = leerCookie(request);
  if (token) await db.prepare('DELETE FROM sesiones WHERE huella = ?').bind(await huella(token)).run();
}

export async function cerrarTodas(db: D1, clienteId: number) {
  await db.prepare('DELETE FROM sesiones WHERE cliente_id = ?').bind(clienteId).run();
}
