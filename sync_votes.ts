import { Client } from 'pg';

async function sync() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });

  try {
    await client.connect();
    console.log('Sincronizando estado de votación para el 70% de usuarios...');

    // 1. Asegurar que los recibos de voto existan y estén confirmados para los primeros 70 votantes
    // Esto ya lo hizo el simulador anterior, pero vamos a reforzar el padrón electoral.

    await client.query(`
            UPDATE padron_electoral 
            SET voto_emitido = true, votado_en = NOW() 
            WHERE id_usuario IN (
                SELECT id_usuario FROM recibos_voto WHERE estado = 'CONFIRMADO'
            )
        `);

    const res = await client.query(
      'SELECT count(*) as total FROM padron_electoral WHERE voto_emitido = true',
    );
    console.log(
      `¡Sincronización terminada! Total usuarios que emitieron voto: ${res.rows[0].total}`,
    );
  } catch (err) {
    console.error('Error sincronizando:', err);
  } finally {
    await client.end();
  }
}

sync();
