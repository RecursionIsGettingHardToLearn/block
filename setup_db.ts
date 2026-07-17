import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { DB, describirConexion } from './db_config';

async function run() {
  console.log(`Conexión → ${describirConexion()}`);
  // Para crear la base hay que conectarse primero a la de mantenimiento.
  const client = new Client({ ...DB, database: 'postgres' });

  try {
    await client.connect();
    console.log('Connected to postgres');

    // Check if evoting_db exists
    const res = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB.database],
    );
    if (res.rowCount === 0) {
      console.log(`Creando la base ${DB.database}...`);
      await client.query(`CREATE DATABASE "${DB.database}"`);
    } else {
      console.log(`La base ${DB.database} ya existe`);
    }
    await client.end();

    const evotingClient = new Client(DB);
    await evotingClient.connect();
    console.log(`Conectado a ${DB.database}`);

    const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
    console.log('Aplicando database.sql (borra y recrea TODAS las tablas)...');
    await evotingClient.query(sql);
    console.log('Database setup complete');
    await evotingClient.end();
  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  }
}

run();
