import { Client } from 'pg';

async function simulate() {
  const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });

  try {
    await pgClient.connect();
    console.log('Iniciando simulación real (70%)...');

    const electionsRes = await pgClient.query(
      "SELECT id FROM elecciones WHERE estado = 'ACTIVA' LIMIT 1",
    );
    const usersRes = await pgClient.query(
      "SELECT id, identificador FROM usuarios WHERE rol = 'VOTANTE' LIMIT 70",
    );

    if (electionsRes.rows.length === 0)
      return console.log('No hay elecciones activas.');

    const electionId = electionsRes.rows[0].id;
    const users = usersRes.rows;

    const candRes = await pgClient.query(
      'SELECT id FROM candidatos WHERE id_eleccion = $1',
      [electionId],
    );
    const candidates = candRes.rows;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const candidate = candidates[i % candidates.length];

      // Realizar login para obtener token
      const loginRes = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identificador: user.identificador,
          password: 'password123',
        }),
      });

      const loginData: any = await loginRes.json();
      const token = loginData.access_token;

      // Emitir voto a la ruta correcta /fabric/vote
      const voteRes = await fetch('http://localhost:3000/fabric/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ electionId, candidateId: candidate.id }),
      });

      if (voteRes.ok) {
        if (i % 10 === 0) console.log(`... Voto ${i} registrado correctamente`);
      } else {
        console.error(`Error en voto ${i}:`, await voteRes.text());
      }
    }

    console.log(
      '¡Simulación completada! 70% de los estudiantes ya han votado en el sistema.',
    );
  } catch (err) {
    console.error('Error crítico:', err);
  } finally {
    await pgClient.end();
  }
}

simulate();
