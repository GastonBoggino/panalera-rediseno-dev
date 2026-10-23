// Canjea el "code" de instalación de la app de Tiendanube por la clave de acceso
// y la guarda en .env.local. Solo acepta la tienda demo DEV (nunca la real ni la vieja "x").
// Uso: node scripts-local/obtener-token-tiendanube.mjs
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const TIENDAS_DEV = { "8415696": "Pañalera Rediseño DEV" };
const TIENDA_REAL = "6357775";
const envPath = new URL("../.env.local", import.meta.url);

const rl = createInterface({ input: stdin, output: stdout });
const clientId = (await rl.question("ID de la app (App ID / client_id): ")).trim();
const clientSecret = (await rl.question("Client secret: ")).trim();
let code = (await rl.question("Code (o pegá la dirección completa a la que te llevó Tiendanube): ")).trim();
rl.close();

const fromUrl = code.match(/[?&]code=([^&#\s]+)/);
if (fromUrl) code = decodeURIComponent(fromUrl[1]);
if (!clientId || !clientSecret || !code) {
  console.error("Faltan datos. Volvé a correr el script.");
  process.exit(1);
}

const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code }),
});
const data = await response.json().catch(() => ({}));

if (!response.ok || !data.access_token) {
  console.error(`Tiendanube no entregó la clave (${response.status}): ${data.error_description || data.error || "respuesta inesperada"}.`);
  console.error("El code vence a los 5 minutos y sirve una sola vez: reinstalá la app y probá de nuevo.");
  process.exit(1);
}

const storeId = String(data.user_id || data.store_id || "");
if (storeId === TIENDA_REAL) {
  console.error("Esta clave es de la TIENDA REAL. No se guardó. Desinstalá ya la app de la tienda real (Aplicaciones → ERP Panalera - Prueba → Desinstalar) y repetí la instalación desde una ventana de incógnito logueada solo en la tienda DEV.");
  process.exit(1);
}
if (!TIENDAS_DEV[storeId]) {
  console.error(`La clave es de la tienda ${storeId}, que no es una tienda DEV (${Object.keys(TIENDAS_DEV).join(", ")}). No se guardó.`);
  process.exit(1);
}

let env = await readFile(envPath, "utf8");
const setVar = (name, value) => {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
};
setVar("TIENDANUBE_ACCESS_TOKEN", data.access_token);
setVar("TIENDANUBE_STORE_ID", storeId);
await writeFile(envPath, env, { mode: 0o600 });

console.log(`Listo: clave guardada en .env.local para la tienda DEV ${storeId} (${TIENDAS_DEV[storeId]}).`);
console.log(`Permisos otorgados: ${data.scope || "(sin detalle)"}`);
