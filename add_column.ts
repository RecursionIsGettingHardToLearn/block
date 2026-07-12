import { Client } from 'pg';

async function addCol() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });
  try {
    await client.connect();
    await client.query(
      'ALTER TABLE recibos_voto ADD COLUMN IF NOT EXISTS id_candidato UUID;',
    );
    console.log('Columna id_candidato añadida correctamente.');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
addCol();
