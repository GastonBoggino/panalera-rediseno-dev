-- Datos del último pedido del cliente (nombre, WhatsApp, entrega con dirección y forma de pago),
-- para completar el checkout la próxima vez. Solo se devuelven al propio cliente con su sesión.
ALTER TABLE clientes ADD COLUMN datos_pedido TEXT NOT NULL DEFAULT '';
