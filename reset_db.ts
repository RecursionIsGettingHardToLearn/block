import { Client } from 'pg';

async function reset() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });
  try {
    await client.connect();
    await client.query('DELETE FROM recibos_voto');
    await client.query(
      'UPDATE padron_electoral SET voto_emitido = false, votado_en = NULL',
    );
    console.log('Base de datos reseteada para recarga limpia.');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
reset();
