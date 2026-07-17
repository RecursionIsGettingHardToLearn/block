import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuración de conexión ÚNICA para los scripts de base de datos.
 *
 * Hasta ahora cada script hardcodeaba sus propias credenciales (setup_db.ts
 * usaba una contraseña, seed_massive.ts otra distinta) y el backend leía las
 * suyas de backend/.env: tres fuentes de verdad que nunca coincidían, y la
 * causa de estar "arreglando" siempre la base equivocada.
 *
 * Prioridad: variables de entorno del proceso > backend/.env > valores por
 * defecto. Así los scripts y el backend apuntan SIEMPRE a la misma base.
 */
function leerBackendEnv(): Record<string, string> {
  const ruta = path.join(__dirname, 'backend', '.env');
  if (!fs.existsSync(ruta)) return {};
  const valores: Record<string, string> = {};
  for (const linea of fs.readFileSync(ruta, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return valores;
}

const envFile = leerBackendEnv();
const leer = (clave: string, porDefecto: string): string =>
  process.env[clave] ?? envFile[clave] ?? porDefecto;

export const DB = {
  host: leer('DB_HOST', 'localhost'),
  port: parseInt(leer('DB_PORT', '5432'), 10),
  user: leer('DB_USER', 'postgres'),
  password: leer('DB_PASSWORD', ''),
  database: leer('DB_NAME', 'evoting_db'),
};

export function describirConexion(): string {
  const origen = Object.keys(envFile).length
    ? 'backend/.env'
    : 'valores por defecto (backend/.env no encontrado)';
  return `${DB.host}:${DB.port}/${DB.database} como ${DB.user}  [config: ${origen}]`;
}
