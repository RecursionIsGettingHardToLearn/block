import { Client } from 'pg';

async function run() {
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
      "INSERT INTO organizaciones (id, nombre, slug) VALUES ('11111111-1111-1111-1111-111111111111', 'Organización por Defecto', 'default') ON CONFLICT DO NOTHING;",
    );
    console.log('¡Organización 1111... creada con éxito!');
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
