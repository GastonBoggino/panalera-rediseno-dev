// Panel de pruebas EN LÍNEA (SOLO DEV, cuenta de Gaston): el mismo panel que el local, contra el ERP de
// prueba en línea (servicio panalera-erp-dev). El panel no guarda contraseñas: pasa la que escribe el
// usuario y la valida el propio ERP. Marcado para que Google no lo indexe.
import { crearPanel } from '../nucleo.mjs';
import html from '../panel.html';
import catalogo from './catalogo-erp.json';

const ERP = 'https://panalera-erp-dev.gastonboggino.workers.dev';
const productos = new Map(Object.entries(catalogo).map(([sku, [barcode, name, parts]]) => [sku, { barcode, name, parts: parts.map(([part, component, componentSku]) => ({ part, component, componentSku })) }]));
const sesion = { cookie: '' };
const SEGURIDAD = { 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=31536000', 'Cache-Control': 'no-store' };
const responder = (cuerpo, status, tipo, extra = {}) => new Response(cuerpo, { status, headers: { 'Content-Type': tipo, ...SEGURIDAD, ...extra } });
const json = (data, status = 200) => responder(JSON.stringify(data), status, 'application/json; charset=utf-8');
const pedirClave = () => responder('Acceso restringido: panel de pruebas (DEV).', 401, 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="Panel de pruebas DEV", charset="UTF-8"' });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Basic ')) return pedirClave();
    const enviar = (path, init = {}) => env.ERP.fetch(new Request(ERP + path, { ...init, headers: { ...(init.headers || {}), Authorization: auth, Origin: ERP } }));
    // La contraseña la valida el ERP (misma que la del ERP de prueba en línea).
    if ((await enviar('/api/auth/users')).headers.has('WWW-Authenticate')) return pedirClave();
    const panel = crearPanel({ enviar, productos, sesion });
    try {
      if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return json({ error: 'Origen no permitido.' }, 403);
      if (request.method === 'GET' && url.pathname === '/') return responder(html.replace('SOLO DEV · ERP de prueba local + tienda demo', 'SOLO DEV · ERP de prueba EN LÍNEA + tienda demo'), 200, 'text/html; charset=utf-8');
      if (request.method === 'GET' && url.pathname === '/api/pedidos') return json({ pedidos: await panel.listar() });
      if (request.method === 'POST' && url.pathname === '/api/importar') return json({ log: await panel.importar() });
      if (request.method === 'POST' && url.pathname === '/api/catalogo') return json({ log: await panel.catalogo() });
      const m = url.pathname.match(/^\/api\/pedido\/([\w-]{1,40})\/([a-z-]{3,20})$/);
      if (request.method === 'POST' && m) return json({ log: await panel.accion(m[1], m[2]) });
      return json({ error: 'No encontrado.' }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Error' }, 409);
    }
  },
};
