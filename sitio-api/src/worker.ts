// Versión EN LÍNEA del DEV (Cloudflare, cuenta de Gaston): sirve el sitio y su servidor en una
// sola dirección, todo detrás de una contraseña (ACCESO_DEV) y marcado para que Google no lo indexe.
//   /api/*   → servidor del sitio (index.ts)
//   resto    → archivos del sitio (sitio-maqueta)
// Conectado solo a la tienda demo (la real está bloqueada en tiendanube.ts).
import { handle } from './index.ts';
import type { Env } from './tiendanube.ts';

type EnvEnLinea = Env & { ACCESO_DEV?: string; ASSETS: { fetch: (request: Request) => Promise<Response> } };

// Contraseña única (el usuario se ignora). Sin contraseña configurada no entra nadie.
function accesoValido(request: Request, env: EnvEnLinea) {
  const clave = env.ACCESO_DEV || '';
  const auth = request.headers.get('Authorization') || '';
  if (clave.length < 8 || !auth.startsWith('Basic ')) return false;
  let dada = '';
  try { dada = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0))).split(':').slice(1).join(':'); } catch { return false; }
  if (dada.length !== clave.length) return false;
  let diff = 0;
  for (let i = 0; i < clave.length; i++) diff |= clave.charCodeAt(i) ^ dada.charCodeAt(i);
  return diff === 0;
}

const SEGURIDAD: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

function conEncabezados(res: Response, extra: Record<string, string> = {}) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...SEGURIDAD, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request: Request, env: EnvEnLinea): Promise<Response> {
    const url = new URL(request.url);
    // El catálogo con costos tiene su propia clave (Bearer); el resto pide la contraseña del DEV.
    if (url.pathname !== '/api/catalogo/interno' && !accesoValido(request, env)) {
      return conEncabezados(new Response('Acceso restringido: sitio de pruebas (DEV).', { status: 401 }), {
        'WWW-Authenticate': 'Basic realm="Panalera DEV", charset="UTF-8"', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    if (url.pathname.startsWith('/api/')) {
      const destino = new URL(request.url);
      destino.pathname = destino.pathname.slice(4);
      return conEncabezados(await handle(new Request(destino, request), env));
    }
    const res = await env.ASSETS.fetch(request);
    const html = (res.headers.get('Content-Type') || '').includes('text/html');
    return conEncabezados(res, html ? { 'Cache-Control': 'no-store' } : {});
  },
};
