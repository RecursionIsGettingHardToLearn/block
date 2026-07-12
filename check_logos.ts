import { Client } from 'pg';

async function checkLogos() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '7814',
    database: 'evoting_db',
  });

  try {
    await client.connect();

    console.log('=== ELECCIONES EXISTENTES ===');
    const eleccionesRes = await client.query(
      'SELECT id, titulo, estado FROM elecciones',
    );
    console.table(eleccionesRes.rows);

    console.log('\n=== CANDIDATOS Y LOGOS ===');
    const res = await client.query(`
      SELECT c.id, c.nombre_frente, c.nombre_candidato, c.logo_frente, c.url_foto, e.titulo as eleccion
      FROM candidatos c
      JOIN elecciones e ON c.id_eleccion = e.id
      ORDER BY e.titulo, c.nombre_frente
    `);
    console.log(`Total candidatos: ${res.rowCount}`);
    console.table(
      res.rows.map((r) => ({
        eleccion: r.eleccion,
        frente: r.nombre_frente,
        candidato: r.nombre_candidato,
        tiene_logo: r.logo_frente
          ? '✅ (' + r.logo_frente.substring(0, 50) + '...)'
          : '❌',
        tiene_foto: r.url_foto ? '✅' : '❌',
      })),
    );
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkLogos();
