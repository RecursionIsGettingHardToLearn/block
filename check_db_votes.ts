import { Client } from 'pg';

async function check() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });
  try {
    await client.connect();
    const res = await client.query('SELECT * FROM recibos_voto LIMIT 5');
    console.log('Muestra de recibos:', res.rows);
    const count = await client.query('SELECT count(*) FROM recibos_voto');
    console.log('Total recibos:', count.rows[0].count);
    const states = await client.query(
      'SELECT estado, count(*) FROM recibos_voto GROUP BY estado',
    );
    console.log('Estados:', states.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
check();
