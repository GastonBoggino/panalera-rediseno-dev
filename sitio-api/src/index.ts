// Servidor del sitio propio (plan B) — SOLO DEV.
//   GET  /catalogo           catálogo con el formato de la maqueta
//   POST /pedido             valida, recalcula y crea el pedido "a confirmar" en Tiendanube
//   GET  /pedido/:id?t=...   seguimiento por link privado (sin cuenta)
import { cargarCatalogo, limpiarCacheCatalogo } from './catalogo.ts';
import { firmarPedido, verificarPedido } from './link.ts';
import { armarPedidoTiendanube, validarPedido } from './pedido.ts';
import { TiendanubeError, tiendanube, type Env } from './tiendanube.ts';

type Deps = { fetch: typeof fetch; ahora: () => number };

// Límite de pedidos por IP y por teléfono (en memoria por instancia; en producción
// se reemplaza por el limitador de Cloudflare).
const intentos = new Map<string, number[]>();
export function superaLimite(clave: string, max: number, ventanaMs: number, ahora: number) {
  const lista = (intentos.get(clave) || []).filter((t) => ahora - t < ventanaMs);
  lista.push(ahora);
  intentos.set(clave, lista);
  return lista.length > max;
}
export function limpiarLimites() { intentos.clear(); }

function origenPermitido(request: Request, env: Env) {
  const origin = request.headers.get('Origin') || '';
  const permitidos = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  // En línea, el sitio y el servidor comparten dirección: el propio origen siempre vale.
  return { origin, ok: !!origin && (permitidos.includes(origin) || origin === new URL(request.url).origin) };
}

function json(data: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      ...extra,
    },
  });
}

// Clave del local para el catálogo con costos (comparación en tiempo constante).
function claveInternaValida(request: Request, env: Env) {
  const esperada = env.CLAVE_INTERNA || '';
  const dada = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (esperada.length < 32 || dada.length !== esperada.length) return false;
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) diff |= esperada.charCodeAt(i) ^ dada.charCodeAt(i);
  return diff === 0;
}

async function verificarTurnstile(token: unknown, ip: string, env: Env, deps: Deps) {
  if (!env.TURNSTILE_SECRET) throw new Error('Falta TURNSTILE_SECRET.');
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data: any = await r.json().catch(() => ({}));
  return data.success === true;
}

// Etapas que ve el cliente, a partir de lo que el ERP le informa a Tiendanube:
// la orden de preparación (fulfillment) manda; si no hay, el estado de envío y la nota interna.
const POR_PREPARACION: Record<string, string> = {
  IN_PREPARATION: 'preparando', PACKED: 'listo', READY_FOR_PICKUP: 'listo', DISPATCHED: 'en_camino', DELIVERED: 'entregado',
};
export function seguimiento(order: any, preparacion?: string) {
  const nota = String(order.owner_note || '');
  const envio = String(order.shipping_status || '');
  let etapa = 'recibido';
  if (order.status === 'cancelled') etapa = 'cancelado';
  else if (preparacion && POR_PREPARACION[preparacion]) etapa = POR_PREPARACION[preparacion];
  else if (/delivered/.test(envio) || order.status === 'closed') etapa = 'entregado';
  else if (/shipped|fulfilled|dispatched/.test(envio)) etapa = 'en_camino';
  else if (/packed|ready/.test(envio) && !/unpacked/.test(envio)) etapa = 'listo';
  else if (/Confirmado/i.test(nota)) etapa = 'confirmado';
  else if (/Cotizaci[oó]n enviada/i.test(nota)) etapa = 'en_revision';
  return {
    numero: order.number,
    fecha: order.created_at,
    etapa,
    // La API no deja marcar pagado: el ERP deja la nota "Cobro registrado".
    // Cobrado y después cancelado: el cliente tiene que saber que se coordina la devolución.
    pago: order.payment_status === 'paid' || /Cobro registrado/i.test(nota) ? (etapa === 'cancelado' ? 'reintegro' : 'pagado') : 'pendiente',
    // Se canceló con el pedido ya despachado: puede seguir en camino.
    canceladoEnCamino: etapa === 'cancelado' && /DISPATCHED|DELIVERED/.test(String(preparacion || '')),
    // Botón de arrepentimiento: pedido registrado (lo resuelve el local) o cancelación interna en curso.
    cancelacionSolicitada: etapa !== 'cancelado' && /WEB · Pedido de cancelación del cliente/.test(nota),
    cancelacionEnCurso: etapa !== 'cancelado' && /Cancelación en curso/.test(nota),
    entrega: order.shipping_option || '',
    total: Math.round(Number(order.total || 0)),
    items: (order.products || []).map((p: any) => ({ nombre: p.name, cantidad: Number(p.quantity), precio: Math.round(Number(p.price)) })),
  };
}

// En Workers, fetch no puede llamarse como método de otro objeto ("Illegal invocation").
const depsPorDefecto: Deps = { fetch: (input, init) => fetch(input, init), ahora: () => Date.now() };

export async function handle(request: Request, env: Env, deps: Deps = depsPorDefecto): Promise<Response> {
  const url = new URL(request.url);
  const { origin, ok: origenOk } = origenPermitido(request, env);
  const cors = origenOk ? origin : null;

  if (request.method === 'OPTIONS') {
    if (!origenOk) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600', Vary: 'Origin',
    } });
  }

  try {
    const api = tiendanube(env, deps.fetch);
    // El catálogo público nunca lleva costos. El del local (/catalogo/interno) pide la clave interna.
    if (request.method === 'GET' && url.pathname === '/catalogo') {
      const items = await cargarCatalogo(api, false, deps.ahora());
      return json({ items, costos: false }, 200, cors);
    }
    if (request.method === 'GET' && url.pathname === '/catalogo/interno') {
      if (!claveInternaValida(request, env)) return json({ errores: ['No autorizado.'] }, 401, null);
      const items = await cargarCatalogo(api, true, deps.ahora());
      return json({ items, costos: true }, 200, null);
    }

    if (request.method === 'POST' && url.pathname === '/pedido') {
      if (!origenOk) return json({ errores: ['Origen no permitido.'] }, 403, null);
      // Se mide el cuerpo real (el encabezado Content-Length se puede omitir).
      const crudo = await request.text();
      if (crudo.length > 50_000) return json({ errores: ['Pedido demasiado grande.'] }, 413, cors);
      const ip = request.headers.get('CF-Connecting-IP') || '';
      const ahora = deps.ahora();
      if (ip && superaLimite(`ip:${ip}`, 5, 10 * 60_000, ahora)) return json({ errores: ['Demasiados pedidos seguidos. Probá en unos minutos o escribinos por WhatsApp.'] }, 429, cors);

      let body: any = null;
      try { body = JSON.parse(crudo); } catch { body = null; }
      if (!(await verificarTurnstile(body?.turnstile, ip, env, deps))) return json({ errores: ['No pudimos verificar que no seas un robot. Recargá la página.'] }, 400, cors);

      const v = validarPedido(body);
      if (!v.ok) return json({ errores: v.errores }, 422, cors);
      if (superaLimite(`tel:${v.pedido.cliente.telefono}`, 3, 60 * 60_000, ahora)) return json({ errores: ['Ya recibimos varios pedidos de este teléfono. Escribinos por WhatsApp.'] }, 429, cors);

      let catalogo = await cargarCatalogo(api, false, ahora);
      let armado = armarPedidoTiendanube(v.pedido, catalogo, Number(env.MINIMO_PEDIDO || 50000));
      if (!armado.ok && /ya no están disponibles/.test(armado.errores[0])) {
        // Puede ser caché vieja: se vuelve a leer una vez antes de rechazar.
        limpiarCacheCatalogo();
        catalogo = await cargarCatalogo(api, false, ahora);
        armado = armarPedidoTiendanube(v.pedido, catalogo, Number(env.MINIMO_PEDIDO || 50000));
      }
      if (!armado.ok) return json({ errores: armado.errores }, 422, cors);

      const creado = await api('/orders', { method: 'POST', body: JSON.stringify(armado.body) });
      const token = await firmarPedido(creado.id, env.LINK_SECRET || '');
      return json({ numero: creado.number, total: armado.total, seguimiento: `/pedido/${creado.id}?t=${token}` }, 201, cors);
    }

    // Botón de arrepentimiento. Antes de que se empiece a preparar, cancela; después, solo registra
    // el pedido de cancelación (el local lo resuelve: no se cancela un pedido en reparto desde la web).
    const mc = url.pathname.match(/^\/pedido\/(\d{1,15})\/cancelacion$/);
    if (request.method === 'POST' && mc) {
      if (!origenOk) return json({ errores: ['Origen no permitido.'] }, 403, null);
      if (!(await verificarPedido(mc[1], url.searchParams.get('t') || '', env.LINK_SECRET || ''))) return json({ errores: ['Link inválido.'] }, 404, cors);
      if (superaLimite(`cancel:${mc[1]}`, 3, 60 * 60_000, deps.ahora())) return json({ errores: ['Ya recibimos tu pedido. Escribinos por WhatsApp.'] }, 429, cors);
      const body: any = await request.json().catch(() => ({}));
      const motivo = String(body?.motivo ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      const order = await api(`/orders/${mc[1]}?fields=id,status,payment_status,owner_note`);
      if (order.status === 'cancelled') return json({ resultado: 'ya_cancelado' }, 200, cors);
      const fos = await api(`/orders/${mc[1]}/fulfillment-orders`).catch(() => []);
      const preparacion = Array.isArray(fos) && fos[0]?.status ? String(fos[0].status).toUpperCase() : 'UNPACKED';
      // En camino o entregado: no se cancela ni se pide cancelar desde la web.
      if (['DISPATCHED', 'DELIVERED'].includes(preparacion)) return json({ errores: ['Tu pedido ya está en camino: no se puede cancelar desde la web. Escribinos por WhatsApp.'] }, 409, cors);
      const nota = String(order.owner_note || '');
      // Si ya está cobrado, no se cancela solo: hay que coordinar la devolución del dinero.
      const cobrado = order.payment_status === 'paid' || /Cobro registrado/i.test(nota);
      if (preparacion === 'UNPACKED' && order.status === 'open' && !cobrado) {
        await api(`/orders/${mc[1]}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'customer', email: false, restock: false }) });
        return json({ resultado: 'cancelado' }, 200, cors);
      }
      if (!/WEB · Pedido de cancelación del cliente/.test(nota)) {
        const fecha = new Date(deps.ahora()).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const linea = `WEB · Pedido de cancelación del cliente (botón de arrepentimiento) · ${fecha}${motivo ? ` · Motivo: ${motivo}` : ''}`;
        await api(`/orders/${mc[1]}`, { method: 'PUT', body: JSON.stringify({ owner_note: nota ? `${nota}\n${linea}` : linea }) });
      }
      return json({ resultado: 'solicitado' }, 200, cors);
    }

    const m = url.pathname.match(/^\/pedido\/(\d{1,15})$/);
    if (request.method === 'GET' && m) {
      if (!(await verificarPedido(m[1], url.searchParams.get('t') || '', env.LINK_SECRET || ''))) return json({ errores: ['Link inválido.'] }, 404, cors);
      const order = await api(`/orders/${m[1]}?fields=id,number,created_at,status,payment_status,shipping_status,shipping_option,owner_note,total,products`);
      // Si la clave no tiene permiso de preparación, se sigue solo con el estado del pedido.
      const fos = await api(`/orders/${m[1]}/fulfillment-orders`).catch(() => []);
      const preparacion = Array.isArray(fos) && fos[0]?.status ? String(fos[0].status).toUpperCase() : undefined;
      return json(seguimiento(order, preparacion), 200, cors);
    }

    return json({ errores: ['No encontrado.'] }, 404, cors);
  } catch (error) {
    // Nunca se devuelven detalles internos ni datos de la tienda.
    const status = error instanceof TiendanubeError && error.status === 404 ? 404 : 502;
    console.error('sitio-api', error instanceof Error ? error.message : 'error');
    return json({ errores: ['No pudimos procesar el pedido. Probá de nuevo o escribinos por WhatsApp.'] }, status, cors);
  }
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
