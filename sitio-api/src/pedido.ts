// Validación del pedido que manda el sitio y armado del pedido para Tiendanube.
// El navegador solo manda variante y cantidad: precios y total se recalculan acá.
import type { Item } from './catalogo.ts';

export type Entrega =
  | { tipo: 'retiro' }
  | { tipo: 'envio'; zona: 'rosario' | 'expreso'; calle: string; numero: string; piso?: string; ciudad: string; provincia: string; cp: string };

export type PedidoValido = {
  items: { variant_id: number; quantity: number }[];
  cliente: { nombre: string; telefono: string; email: string };
  entrega: Entrega;
  pago: 'efectivo' | 'transferencia';
  nota: string;
};

const texto = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Teléfono argentino: se guarda solo con dígitos, con 54 adelante.
export function normalizarTelefono(v: unknown) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // El "15" de celular solo se quita si sobra (área + 15 + número = 12 dígitos).
  if (d.length === 12) d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  return d.length === 10 ? `54${d}` : '';
}

export function validarPedido(body: any): { ok: true; pedido: PedidoValido } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  if (!body || typeof body !== 'object') return { ok: false, errores: ['Pedido vacío.'] };
  if (texto(body.empresa_web, 10)) return { ok: false, errores: ['No se pudo enviar el pedido.'] }; // campo trampa para bots

  const porVariante = new Map<number, number>();
  const lista = Array.isArray(body.items) ? body.items : [];
  if (lista.length === 0 || lista.length > 150) errores.push('El pedido tiene que tener entre 1 y 150 productos.');
  for (const it of lista.slice(0, 150)) {
    const id = Number(it?.variant_id), q = Number(it?.quantity);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(q) || q < 1 || q > 500) { errores.push('Hay un producto o una cantidad inválida.'); break; }
    porVariante.set(id, (porVariante.get(id) || 0) + q);
  }

  const nombre = texto(body.cliente?.nombre, 80);
  const telefono = normalizarTelefono(body.cliente?.telefono);
  const emailIn = texto(body.cliente?.email, 120).toLowerCase();
  if (nombre.length < 2) errores.push('Falta el nombre.');
  if (!telefono) errores.push('Falta un teléfono válido (con código de área, ej. 341 555-1234).');
  if (emailIn && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(emailIn)) errores.push('El e-mail no es válido.');

  let entrega: Entrega = { tipo: 'retiro' };
  const e = body.entrega || {};
  if (e.tipo === 'envio') {
    const d = { calle: texto(e.calle, 80), numero: texto(e.numero, 10), piso: texto(e.piso, 20), ciudad: texto(e.ciudad, 60), provincia: texto(e.provincia, 40), cp: texto(e.cp, 8) };
    if (!d.calle || !/^\d{1,6}$/.test(d.numero) || !d.ciudad || !d.provincia || !/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(d.cp)) errores.push('Para envío completá calle, número, ciudad, provincia y código postal.');
    entrega = { tipo: 'envio', zona: e.zona === 'expreso' ? 'expreso' : 'rosario', ...d };
  } else if (e.tipo && e.tipo !== 'retiro') errores.push('Forma de entrega inválida.');

  const pago = body.pago === 'transferencia' ? 'transferencia' : body.pago === 'efectivo' || !body.pago ? 'efectivo' : null;
  if (!pago) errores.push('Forma de pago inválida.');

  if (errores.length) return { ok: false, errores };
  return {
    ok: true,
    pedido: {
      items: [...porVariante].map(([variant_id, quantity]) => ({ variant_id, quantity })),
      cliente: { nombre, telefono, email: emailIn },
      entrega, pago: pago!, nota: texto(body.nota, 500),
    },
  };
}

export const ETIQUETA_ENTREGA = {
  retiro: 'Retiro en el local (Garay 1249)',
  rosario: 'Envío en Rosario y alrededores (costo a coordinar)',
  expreso: 'Envío por expreso (a coordinar)',
};

// Recalcula con los precios del catálogo y arma el cuerpo de POST /orders.
export function armarPedidoTiendanube(p: PedidoValido, catalogo: Item[], minimo: number) {
  const porId = new Map(catalogo.map((i) => [i.variant_id, i]));
  const faltan = p.items.filter((i) => !porId.has(i.variant_id));
  if (faltan.length) return { ok: false as const, errores: [`${faltan.length} producto(s) ya no están disponibles. Actualizá la página.`] };
  const total = p.items.reduce((s, i) => s + porId.get(i.variant_id)!.price * i.quantity, 0);
  if (total < minimo) return { ok: false as const, errores: [`La compra mínima es de $${minimo.toLocaleString('es-AR')}. Te faltan $${(minimo - total).toLocaleString('es-AR')}.`] };

  const [nombre, ...resto] = p.cliente.nombre.split(' ');
  const envio = p.entrega.tipo === 'envio' ? p.entrega : null;
  const direccion = envio
    ? { first_name: nombre, last_name: resto.join(' ') || '-', address: envio.calle, number: Number(envio.numero), floor: envio.piso || undefined, city: envio.ciudad, province: envio.provincia, zipcode: envio.cp, country: 'AR', phone: `+${p.cliente.telefono}` }
    : { first_name: nombre, last_name: resto.join(' ') || '-', address: 'Garay', number: 1249, city: 'Rosario', province: 'Santa Fe', zipcode: '2000', country: 'AR', phone: `+${p.cliente.telefono}` };
  const nota = [
    'Pedido desde el sitio propio · A confirmar stock por WhatsApp',
    `Pago: ${p.pago === 'transferencia' ? 'Transferencia (+5%)' : 'Efectivo'}`,
    p.nota && `Nota del cliente: ${p.nota}`,
  ].filter(Boolean).join(' · ');

  return {
    ok: true as const,
    total,
    body: {
      gateway: 'offline',
      payment_status: 'pending',
      inventory_behaviour: 'bypass',
      send_confirmation_email: false,
      send_fulfillment_email: false,
      shipping_pickup_type: envio ? 'ship' : 'pickup',
      shipping: 'not-provided',
      shipping_option: envio ? ETIQUETA_ENTREGA[envio.zona] : ETIQUETA_ENTREGA.retiro,
      shipping_cost_customer: 0,
      note: nota,
      customer: {
        name: p.cliente.nombre,
        // Tiendanube exige e-mail; si el cliente no lo da, se usa uno que no recibe correo.
        email: p.cliente.email || `cliente-${p.cliente.telefono}@sin-email.invalid`,
        phone: `+${p.cliente.telefono}`,
      },
      billing_address: direccion,
      shipping_address: direccion,
      products: p.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
    },
  };
}
