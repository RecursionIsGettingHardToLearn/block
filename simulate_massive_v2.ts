import { Client } from 'pg';

async function simulateMassive() {
  const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });

  try {
    await pgClient.connect();
    console.log('Iniciando simulación multielección (Participación > 60%)...');

    const electionsRes = await pgClient.query(
      "SELECT id, titulo FROM elecciones WHERE estado = 'ACTIVA'",
    );
    const elections = electionsRes.rows;

    // Obtenemos los 100 usuarios votantes
    const usersRes = await pgClient.query(
      "SELECT id, identificador FROM usuarios WHERE rol = 'VOTANTE' LIMIT 100",
    );
    const allUsers = usersRes.rows;

    // Porcentajes sugeridos para cada elección
    const targets = [85, 72, 64, 91, 68];

    for (let i = 0; i < elections.length; i++) {
      const election = elections[i];
      const targetPct = targets[i % targets.length];
      const targetCount = Math.floor((allUsers.length * targetPct) / 100);

      console.log(
        `\n>>> Procesando: ${election.titulo} (${targetPct}% - ${targetCount} votos)`,
      );

      const candRes = await pgClient.query(
        'SELECT id FROM candidatos WHERE id_eleccion = $1',
        [election.id],
      );
      const candidates = candRes.rows;

      if (candidates.length === 0) continue;

      // Seleccionamos un subconjunto aleatorio de usuarios para esta elección
      const voters = allUsers.slice(0, targetCount);

      for (let j = 0; j < voters.length; j++) {
        const user = voters[j];
        const candidate = candidates[j % candidates.length]; // Distribuir votos

        try {
          // Login
          const loginRes = await fetch('http://localhost:3000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identificador: user.identificador,
              password: 'password123',
            }),
          });

          const loginData: any = await loginRes.json();
          if (!loginData.access_token) continue;

          // Votar
          await fetch('http://localhost:3000/fabric/vote', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${loginData.access_token}`,
            },
            body: JSON.stringify({
              electionId: election.id,
              candidateId: candidate.id,
            }),
          });

          // Pequeña pausa para estabilidad
          await new Promise((r) => setTimeout(r, 100));

          if (j % 20 === 0) process.stdout.write('.');
        } catch (e) {
          // Ignorar errores individuales
        }
      }
      console.log(`\n[OK] ${election.titulo} completada.`);
    }

    console.log('\n¡Carga masiva multielección finalizada con éxito!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pgClient.end();
  }
}

simulateMassive();
