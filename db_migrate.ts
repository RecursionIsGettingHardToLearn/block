import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { DB, describirConexion } from './db_config';

/**
 * Aplica las migraciones pendientes de `migrations/` en orden alfabético.
 *
 * A diferencia de `db:reset`, NO destruye nada: registra en la tabla
 * `schema_migrations` cuáles ya se aplicaron y ejecuta solo las que faltan,
 * cada una dentro de una transacción. Es el comando para evolucionar una base
 * que ya tiene datos (la de un compañero, la de producción) sin recrearla.
 */
async function migrate() {
  console.log(`Conexión → ${describirConexion()}`);
  const client = new Client(DB);
  await client.connect();

  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       nombre      TEXT        PRIMARY KEY,
       aplicado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );

  const dir = path.join(__dirname, 'migrations');
  const archivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await client.query<{ nombre: string }>(
    'SELECT nombre FROM schema_migrations',
  );
  const aplicadas = new Set(rows.map((r) => r.nombre));

  let ejecutadas = 0;
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    console.log(`Aplicando ${archivo}...`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [
        archivo,
      ]);
      await client.query('COMMIT');
      ejecutadas++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ Falló ${archivo} (se revirtió completa):`, err);
      await client.end();
      process.exit(1);
    }
  }

  console.log(
    ejecutadas
      ? `✔ ${ejecutadas} migración(es) aplicada(s)`
      : '✔ La base ya está al día: nada pendiente',
  );
  await client.end();
}

void migrate();
