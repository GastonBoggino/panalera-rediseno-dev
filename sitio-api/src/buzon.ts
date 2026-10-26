// Mensajes al cliente (link del pedido, "¿Perdiste tu pedido?", códigos).
// En DEV no se envía nada: todo queda en el buzón de pruebas, que se ve con la clave interna.
// Cuando haya servicio de e-mail o WhatsApp, se agrega acá el envío real (y el buzón queda solo en DEV).
import type { D1 } from './sesion.ts';

export type Mensaje = { canal: 'email' | 'whatsapp'; destino: string; asunto?: string; cuerpo: string };

const limpio = (s: string, max: number) => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);

export async function enviarMensaje(db: D1, m: Mensaje, ahora: number) {
  if (m.canal !== 'email' && m.canal !== 'whatsapp') throw new Error('Canal no válido.');
  await db.prepare('INSERT INTO buzon (canal, destino, asunto, cuerpo, creado) VALUES (?, ?, ?, ?, ?)')
    .bind(m.canal, limpio(m.destino, 200), limpio(m.asunto || '', 200), limpio(m.cuerpo, 4000), ahora).run();
  // Solo se guardan los últimos 200.
  await db.prepare('DELETE FROM buzon WHERE id NOT IN (SELECT id FROM buzon ORDER BY id DESC LIMIT 200)').bind().run();
}

export async function leerBuzon(db: D1, limite = 50) {
  const { results } = await db.prepare('SELECT id, canal, destino, asunto, cuerpo, creado FROM buzon ORDER BY id DESC LIMIT ?').bind(Math.min(Math.max(limite, 1), 200)).all();
  return results;
}
