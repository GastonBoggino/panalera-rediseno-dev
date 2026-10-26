// Panel de pruebas LOCAL (SOLO DEV): http://127.0.0.1:8791 contra el ERP de prueba local (127.0.0.1:8790).
// La lógica está en nucleo.mjs (la comparte el panel en línea).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { crearPanel } from './nucleo.mjs';

const ERP = 'http://127.0.0.1:8790';
const PUERTO = 8791;
// Servidor del sitio local: el buzón de pruebas se lee con su clave interna (de sitio-api/.dev.vars, no se muestra).
const SITIO = 'http://localhost:8788';
const claveInterna = () => (readFileSync(new URL('../sitio-api/.dev.vars', import.meta.url), 'utf8').match(/^CLAVE_INTERNA=(.*)$/m)?.[1] || '').trim().replace(/^"|"$/g, '');
const catalogoBase = JSON.parse(readFileSync(new URL('../erp-prueba/app/productCatalog.generated.json', import.meta.url), 'utf8'));
const panel = crearPanel({
  enviar: (path, init) => fetch(ERP + path, { ...init, headers: { ...init.headers, Origin: ERP } }),
  productos: new Map(catalogoBase.map((p) => [String(p.sku).toUpperCase(), p])),
});

const html = readFileSync(new URL('./panel.html', import.meta.url), 'utf8');
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PUERTO}`);
    // Solo se usa desde esta Mac: se rechaza cualquier otro origen.
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${PUERTO}` && req.headers.origin !== `http://localhost:${PUERTO}`) return json(res, 403, { error: 'Origen no permitido.' });
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
    if (req.method === 'GET' && url.pathname === '/api/pedidos') return json(res, 200, { pedidos: await panel.listar() });
    if (req.method === 'GET' && url.pathname === '/api/buzon') {
      const r = await fetch(SITIO + '/buzon', { headers: { Authorization: 'Bearer ' + claveInterna() } }).catch(() => null);
      if (!r || !r.ok) return json(res, 502, { error: 'No pude leer el buzón: ¿está prendido el servidor del sitio (puerto 8788)?' });
      return json(res, 200, await r.json());
    }
    if (req.method === 'POST' && url.pathname === '/api/importar') return json(res, 200, { log: await panel.importar() });
    if (req.method === 'POST' && url.pathname === '/api/catalogo') return json(res, 200, { log: await panel.catalogo() });
    const m = url.pathname.match(/^\/api\/pedido\/([\w-]{1,40})\/([a-z-]{3,20})$/);
    if (req.method === 'POST' && m) return json(res, 200, { log: await panel.accion(m[1], m[2]) });
    json(res, 404, { error: 'No encontrado.' });
  } catch (e) {
    json(res, 409, { error: e instanceof Error ? e.message : 'Error' });
  }
}).listen(PUERTO, '127.0.0.1', () => console.log(`Panel de pruebas en http://127.0.0.1:${PUERTO} (ERP de prueba: ${ERP})`));
