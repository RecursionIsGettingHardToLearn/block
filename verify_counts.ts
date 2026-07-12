import { Client } from 'pg';

async function verify() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });
  try {
    await client.connect();
    const res = await client.query(`
            SELECT e.titulo, count(rv.id) as votos_reales
            FROM elecciones e 
            LEFT JOIN recibos_voto rv ON e.id = rv.id_eleccion 
            GROUP BY e.titulo
        `);
    console.log('--- Conteos Actuales ---');
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
verify();
