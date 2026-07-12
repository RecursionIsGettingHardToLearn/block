import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte', // Tu contraseña real
    database: 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to postgres');

    // Check if evoting_db exists
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'evoting_db'",
    );
    if (res.rowCount === 0) {
      console.log('Creating database evoting_db...');
      await client.query('CREATE DATABASE evoting_db');
    } else {
      console.log('Database evoting_db already exists');
    }
    await client.end();

    // Connect to evoting_db
    const evotingClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'muerte',
      database: 'evoting_db',
    });
    await evotingClient.connect();
    console.log('Connected to evoting_db');

    const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
    console.log('Running database.sql...');
    await evotingClient.query(sql);
    console.log('Database setup complete');
    await evotingClient.end();
  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  }
}

run();
