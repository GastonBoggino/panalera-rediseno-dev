// Cliente mínimo de la API de Tiendanube. Solo trabaja con las tiendas DEV:
// la tienda real queda bloqueada aunque alguien cambie la configuración.

// Solo la tienda demo de Partners. La vieja tienda de prueba "x" (8413613) ya no se usa.
import type { D1 } from './sesion.ts';

export const TIENDAS_DEV = ['8415696'];
export const TIENDA_REAL = '6357775';

export type Env = {
  TIENDANUBE_STORE_ID: string;
  TIENDANUBE_ACCESS_TOKEN: string;
  TIENDANUBE_USER_AGENT?: string;
  ALLOWED_ORIGINS?: string;
  CLAVE_INTERNA?: string;
  MINIMO_PEDIDO?: string;
  LINK_SECRET?: string;
  TURNSTILE_SECRET?: string;
  // Base del sitio (cuentas de clientes). Sin base, el sitio funciona igual, solo sin cuentas.
  DB?: D1;
  // ID de cliente de Google (público) para "Continuar con Google".
  GOOGLE_CLIENT_ID?: string;
};

export class TiendanubeError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export type Api = (path: string, init?: RequestInit) => Promise<any>;

export function tiendanube(env: Env, fetchImpl: typeof fetch = fetch): Api {
  const store = String(env.TIENDANUBE_STORE_ID || '');
  if (store === TIENDA_REAL || !TIENDAS_DEV.includes(store)) throw new Error(`Tienda ${store || '(vacía)'} no permitida: solo tiendas DEV.`);
  if (!env.TIENDANUBE_ACCESS_TOKEN) throw new Error('Falta TIENDANUBE_ACCESS_TOKEN.');
  return async (path, init = {}) => {
    const response = await fetchImpl(`https://api.tiendanube.com/v1/${store}${path}`, {
      ...init,
      headers: {
        Authentication: `bearer ${env.TIENDANUBE_ACCESS_TOKEN}`,
        'User-Agent': env.TIENDANUBE_USER_AGENT || 'Panalera sitio DEV',
        'Content-Type': 'application/json',
      },
    });
    const body = await response.json().catch(() => null);
    // Sin páginas siguientes Tiendanube responde 404 "Last page is N".
    if (response.status === 404 && /last page/i.test(JSON.stringify(body))) return [];
    if (!response.ok) throw new TiendanubeError(response.status, `${init.method || 'GET'} ${path.split('?')[0]} → ${response.status}`);
    return body;
  };
}
