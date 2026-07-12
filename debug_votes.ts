import { Client } from 'pg';

async function debug() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '7814',
    database: 'evoting_db',
  });

  try {
    await client.connect();

    console.log('=== VOTOS EN RECEIBOS_VOTO ===');
    const res1 = await client.query(`
      SELECT id_usuario, id_eleccion, id_candidato, tipo_voto_especial, estado, creado_en 
      FROM recibos_voto 
      ORDER BY creado_en DESC 
      LIMIT 10
    `);
    console.table(res1.rows);

    console.log('\n=== CONTEO POR ELECCION ===');
    const res2 = await client.query(`
      SELECT 
        id_eleccion,
        COUNT(*) as total,
        COUNT(id_candidato) as con_candidato,
        COUNT(tipo_voto_especial) FILTER (WHERE tipo_voto_especial = 'votos_blancos') as blancos,
        COUNT(tipo_voto_especial) FILTER (WHERE tipo_voto_especial = 'votos_nulos') as nulos
      FROM recibos_voto
      WHERE estado = 'CONFIRMADO'
      GROUP BY id_eleccion
    `);
    console.table(res2.rows);

    console.log('\n=== VALORES DE tipo_voto_especial ===');
    const res3 = await client.query(`
      SELECT DISTINCT tipo_voto_especial, COUNT(*) 
      FROM recibos_voto 
      WHERE estado = 'CONFIRMADO'
      GROUP BY tipo_voto_especial
    `);
    console.table(res3.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

debug();
