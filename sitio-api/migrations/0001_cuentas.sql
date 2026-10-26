-- Cuentas de clientes (plan PLAN-CUENTAS-CLIENTES.md) — SOLO DEV.
-- Sin contraseñas. Los pedidos y sus estados siguen en Tiendanube y el ERP: acá solo se guarda
-- de quién es cada pedido. Tokens y códigos se guardan como huella (SHA-256), nunca en claro.

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  email_verificado INTEGER NOT NULL DEFAULT 0,
  nombre TEXT NOT NULL DEFAULT '',
  telefono TEXT,
  telefono_verificado INTEGER NOT NULL DEFAULT 0,
  google_sub TEXT UNIQUE,
  tiendanube_id INTEGER,
  creado INTEGER NOT NULL,
  actualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS clientes_telefono ON clientes (telefono);

CREATE TABLE IF NOT EXISTS sesiones (
  huella TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  creada INTEGER NOT NULL,
  vence INTEGER NOT NULL,
  ultimo_uso INTEGER NOT NULL,
  dispositivo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sesiones_cliente ON sesiones (cliente_id);

-- Un pedido de Tiendanube pertenece a un solo cliente.
CREATE TABLE IF NOT EXISTS pedidos_cliente (
  pedido_id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pedidos_cliente_cliente ON pedidos_cliente (cliente_id);

-- "¿Perdiste tu pedido?" y verificación de teléfono: un solo uso, vencen a los 15 minutos.
CREATE TABLE IF NOT EXISTS codigos (
  huella TEXT PRIMARY KEY,
  proposito TEXT NOT NULL,
  destino TEXT NOT NULL,
  vence INTEGER NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  intentos INTEGER NOT NULL DEFAULT 0
);

-- Buzón de pruebas: en DEV los mensajes al cliente se guardan acá y no se envían a nadie.
CREATE TABLE IF NOT EXISTS buzon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL,
  destino TEXT NOT NULL,
  asunto TEXT NOT NULL DEFAULT '',
  cuerpo TEXT NOT NULL,
  creado INTEGER NOT NULL
);
