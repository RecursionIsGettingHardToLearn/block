import { Client } from 'pg';

async function updateOldVotes() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '7814',
    database: 'evoting_db',
  });

  try {
    await client.connect();

    console.log(
      '=== VOTOS SIN tipo_voto_especial PERO CON id_candidato NULL ===',
    );
    const res1 = await client.query(`
      SELECT id_usuario, id_eleccion, id_candidato, tipo_voto_especial, estado
      FROM recibos_voto
      WHERE tipo_voto_especial IS NULL AND id_candidato IS NULL AND estado = 'CONFIRMADO'
      LIMIT 10
    `);
    console.table(res1.rows);

    console.log('\n=== CANTIDAD DE VOTOS A ACTUALIZAR ===');
    const res2 = await client.query(`
      SELECT COUNT(*) as total
      FROM recibos_voto
      WHERE tipo_voto_especial IS NULL AND id_candidato IS NULL AND estado = 'CONFIRMADO'
    `);
    console.log(`Total: ${res2.rows[0]?.total}`);

    console.log('\n=== ACTUALIZANDO VOTOS ANTIGUOS A "votos_blancos" ===');
    console.log(
      'NOTA: Se asigna como "votos_blancos" por defecto ya que no hay forma de saber',
    );
    console.log(
      'si eran blancos o nulos. Esta es la práctica más común en sistemas de votación.',
    );

    const updateRes = await client.query(`
      UPDATE recibos_voto
      SET tipo_voto_especial = 'votos_blancos'
      WHERE tipo_voto_especial IS NULL AND id_candidato IS NULL AND estado = 'CONFIRMADO'
    `);
    console.log(`Votos actualizados: ${updateRes.rowCount}`);

    console.log('\n=== VERIFICACIÓN POSTERIOR ===');
    const res3 = await client.query(`
      SELECT DISTINCT tipo_voto_especial, COUNT(*) as count
      FROM recibos_voto
      WHERE estado = 'CONFIRMADO'
      GROUP BY tipo_voto_especial
      ORDER BY tipo_voto_especial NULLS FIRST
    `);
    console.table(res3.rows);

    console.log(
      '\n✅ Votos antiguos actualizados correctamente a "votos_blancos"',
    );
  } catch (err) {
    console.error('Error al actualizar votos:', err);
  } finally {
    await client.end();
  }
}

updateOldVotes();
