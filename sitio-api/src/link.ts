// Link privado de seguimiento ("Mis pedidos" sin cuenta): el id del pedido firmado
// con un secreto del servidor. Sin la firma no se puede consultar ningún pedido.

const enc = new TextEncoder();

async function clave(secret: string) {
  if (!secret || secret.length < 32) throw new Error('LINK_SECRET tiene que tener al menos 32 caracteres.');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function firmarPedido(id: string | number, secret: string) {
  const firma = await crypto.subtle.sign('HMAC', await clave(secret), enc.encode(`pedido:${id}`));
  return hex(firma).slice(0, 32);
}

export async function verificarPedido(id: string | number, token: string, secret: string) {
  if (!/^[0-9a-f]{32}$/.test(token || '')) return false;
  const esperado = await firmarPedido(id, secret);
  // Comparación en tiempo constante.
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
