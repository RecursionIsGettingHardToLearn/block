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
    const res = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;",
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
