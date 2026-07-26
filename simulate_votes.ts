import { Client } from 'pg';

/**
 * Simulador de votos para pruebas. Emite votos por la API REAL (/fabric/vote),
 * igual que un votante de verdad: cada voto pasa por la validación y queda
 * blindado en la blockchain con su txId. NO inserta en la base directamente.
 *
 * Genera resultados realistas y variados:
 *  - Participación configurable (por defecto ~75% del padrón de prueba).
 *  - Reparto ponderado entre candidatos (uno gana con más margen, en vez de un
 *    empate perfecto), con algo de aleatoriedad.
 *  - Un pequeño porcentaje de votos en blanco y nulos.
 *
 * Requisitos: backend corriendo en localhost:3000 y una elección ACTIVA.
 * Uso:  npx ts-node simulate_votes.ts
 */

// ── Parámetros ajustables ────────────────────────────────────────────────
const API = 'http://localhost:3000';
const PASSWORD_VOTANTES = 'password123'; // la que usa seed_massive.ts
const MAX_VOTANTES = 90; // cuántos votantes de prueba considerar
const PARTICIPACION = 0.75; // fracción del padrón que efectivamente vota
const PCT_BLANCO = 0.06; // ~6% vota en blanco
const PCT_NULO = 0.04; // ~4% vota nulo
// ─────────────────────────────────────────────────────────────────────────

/** Elige un índice segun pesos (mayor peso = más probable). */
function elegirPonderado(pesos: number[]): number {
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pesos.length; i++) {
    r -= pesos[i];
    if (r <= 0) return i;
  }
  return pesos.length - 1;
}

async function simulate() {
  const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'evoting_db',
  });

  try {
    await pgClient.connect();
    console.log('Iniciando simulación de votos (por API real)...\n');

    const electionsRes = await pgClient.query(
      "SELECT id, titulo FROM elecciones WHERE estado = 'ACTIVA' LIMIT 1",
    );
    if (electionsRes.rows.length === 0)
      return console.log('No hay elecciones activas. Activa una y reintenta.');

    const electionId = electionsRes.rows[0].id as string;
    const electionTitle = electionsRes.rows[0].titulo as string;

    const usersRes = await pgClient.query(
      "SELECT id, identificador FROM usuarios WHERE rol = 'VOTANTE' LIMIT $1",
      [MAX_VOTANTES],
    );
    const candRes = await pgClient.query(
      'SELECT id, nombre_frente FROM candidatos WHERE id_eleccion = $1 ORDER BY orden_boleta',
      [electionId],
    );

    const users = usersRes.rows;
    const candidates = candRes.rows;

    if (candidates.length === 0)
      return console.log('La elección activa no tiene candidatos.');

    // Pesos por candidato: decrecientes para que el primero gane con margen,
    // pero con algo de ruido para que no sea perfectamente predecible.
    const pesos = candidates.map(
      (_, i) => Math.max(1, candidates.length - i) + Math.random(),
    );

    // Cuántos votan realmente (participación).
    const totalVotan = Math.floor(users.length * PARTICIPACION);

    console.log(`Elección:     ${electionTitle}`);
    console.log(`Padrón prueba: ${users.length} votantes`);
    console.log(
      `Votarán:      ${totalVotan} (${Math.round(PARTICIPACION * 100)}% participación)\n`,
    );

    const conteo: Record<string, number> = {};
    let ok = 0;
    let fallidos = 0;

    for (let i = 0; i < totalVotan; i++) {
      const user = users[i];

      // Decidir qué vota este usuario: blanco, nulo o un candidato ponderado.
      const dado = Math.random();
      let candidateId: string;
      let etiqueta: string;
      if (dado < PCT_BLANCO) {
        candidateId = 'votos_blancos';
        etiqueta = 'Blanco';
      } else if (dado < PCT_BLANCO + PCT_NULO) {
        candidateId = 'votos_nulos';
        etiqueta = 'Nulo';
      } else {
        const idx = elegirPonderado(pesos);
        candidateId = candidates[idx].id;
        etiqueta = candidates[idx].nombre_frente;
      }

      // Login del votante para obtener su token.
      const loginRes = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identificador: user.identificador,
          password: PASSWORD_VOTANTES,
        }),
      });
      if (!loginRes.ok) {
        fallidos++;
        continue;
      }
      const loginData: any = await loginRes.json();
      const token = loginData.access_token;

      // Emitir el voto por la API real.
      const voteRes = await fetch(`${API}/fabric/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ electionId, candidateId }),
      });

      if (voteRes.ok) {
        ok++;
        conteo[etiqueta] = (conteo[etiqueta] ?? 0) + 1;
        if (ok % 10 === 0) console.log(`  ... ${ok} votos emitidos`);
      } else {
        fallidos++;
        if (fallidos <= 3)
          console.error(`  Error en voto ${i}:`, await voteRes.text());
      }
    }

    // Reporte final.
    console.log('\n─────────── Resultado de la simulación ───────────');
    console.log(`Votos emitidos: ${ok}   Fallidos: ${fallidos}\n`);
    const orden = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    for (const [etiqueta, n] of orden) {
      const pct = ok > 0 ? Math.round((n / ok) * 100) : 0;
      const barra = '█'.repeat(Math.round(pct / 3));
      console.log(`  ${etiqueta.padEnd(20)} ${String(n).padStart(3)}  ${barra} ${pct}%`);
    }
    console.log('──────────────────────────────────────────────────');
  } catch (err) {
    console.error('Error crítico:', err);
  } finally {
    await pgClient.end();
  }
}

simulate();
