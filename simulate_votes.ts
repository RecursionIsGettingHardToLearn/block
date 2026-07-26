import { Client } from 'pg';

/**
 * Simulador de votos para pruebas. Emite votos por la API REAL (/fabric/vote),
 * igual que un votante de verdad: cada voto pasa por la validación y queda
 * blindado en la blockchain con su txId. NO inserta votos en la base a mano.
 *
 * Antes de votar, ASIGNA automáticamente a los votantes al canal de la elección
 * activa (tabla usuario_canales). Sin esa asignación, el backend rechaza cada
 * voto con "No tienes acceso al canal", que es la causa más común de fallo.
 *
 * Genera resultados realistas: reparto ponderado (un candidato gana con
 * margen), algo de voto en blanco y nulo, y participación configurable.
 *
 * Requisitos: backend corriendo en localhost:3000 y una elección ACTIVA.
 * Uso:  npx ts-node simulate_votes.ts   (desde la RAÍZ del proyecto)
 */

// ── Parámetros ajustables ────────────────────────────────────────────────
const API = 'http://localhost:3000';
const PASSWORD_VOTANTES = 'password123'; // la que usa seed_massive.ts
const MAX_VOTANTES = 90; // cuántos votantes de prueba considerar
const PARTICIPACION = 0.75; // fracción del padrón que efectivamente vota
const PCT_BLANCO = 0.06; // ~6% vota en blanco
const PCT_NULO = 0.04; // ~4% vota nulo
const ASIGNAR_AL_CANAL = true; // asignar votantes al canal antes de votar

// Conexión a PostgreSQL (ajusta si tu entorno difiere).
const DB = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'evoting_db',
};
// ─────────────────────────────────────────────────────────────────────────

/** Elige un índice según pesos (mayor peso = más probable). */
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
  const pg = new Client(DB);

  try {
    await pg.connect();
    console.log('Iniciando simulación de votos (por API real)...\n');

    // 1. Elección activa (con su canal).
    const elecRes = await pg.query(
      "SELECT id, titulo, canal_fabric FROM elecciones WHERE estado = 'ACTIVA' LIMIT 1",
    );
    if (elecRes.rows.length === 0)
      return console.log('No hay elecciones activas. Activa una y reintenta.');

    const electionId = elecRes.rows[0].id as string;
    const electionTitle = elecRes.rows[0].titulo as string;
    const canal = elecRes.rows[0].canal_fabric as string;

    // 2. Votantes de prueba.
    const usersRes = await pg.query(
      "SELECT id, identificador FROM usuarios WHERE rol = 'VOTANTE' LIMIT $1",
      [MAX_VOTANTES],
    );
    const users = usersRes.rows;

    // 3. Candidatos de la elección.
    const candRes = await pg.query(
      'SELECT id, nombre_frente FROM candidatos WHERE id_eleccion = $1 ORDER BY orden_boleta NULLS LAST, creado_en',
      [electionId],
    );
    const candidates = candRes.rows;
    if (candidates.length === 0)
      return console.log('La elección activa no tiene candidatos.');

    console.log(`Elección:      ${electionTitle}`);
    console.log(`Canal:         ${canal}`);
    console.log(`Candidatos:    ${candidates.map((c) => c.nombre_frente).join(', ')}`);
    console.log(`Padrón prueba: ${users.length} votantes\n`);

    // 4. Asignar votantes al canal (si falta). Es la causa #1 de fallo: sin
    //    estar en el canal, el backend rechaza el voto. Idempotente.
    if (ASIGNAR_AL_CANAL) {
      let asignados = 0;
      for (const u of users) {
        const r = await pg.query(
          `INSERT INTO usuario_canales (id_usuario, canal_fabric)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [u.id, canal],
        );
        if (r.rowCount && r.rowCount > 0) asignados++;
      }
      console.log(`Asignados al canal '${canal}': ${asignados} nuevos (resto ya estaba).\n`);
    }

    // 5. Votar.
    const totalVotan = Math.floor(users.length * PARTICIPACION);
    const pesos = candidates.map(
      (_, i) => Math.max(1, candidates.length - i) + Math.random(),
    );

    console.log(`Votarán ${totalVotan} (${Math.round(PARTICIPACION * 100)}% participación):\n`);

    const conteo: Record<string, number> = {};
    let ok = 0;
    let fallidos = 0;

    for (let i = 0; i < totalVotan; i++) {
      const user = users[i];

      // Qué vota: blanco, nulo o candidato ponderado.
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

      // Login del votante.
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
        if (fallidos <= 3)
          console.error(`  Login falló (${user.identificador}):`, await loginRes.text());
        continue;
      }
      const loginData: any = await loginRes.json();
      const token = loginData.access_token;

      // Emitir voto por la API real.
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
          console.error(`  Voto falló:`, await voteRes.text());
      }
    }

    // 6. Reporte final.
    console.log('\n─────────── Resultado de la simulación ───────────');
    console.log(`Votos emitidos: ${ok}   Fallidos: ${fallidos}\n`);
    const orden = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    for (const [etiqueta, n] of orden) {
      const pct = ok > 0 ? Math.round((n / ok) * 100) : 0;
      const barra = '#'.repeat(Math.round(pct / 3));
      console.log(`  ${etiqueta.padEnd(20)} ${String(n).padStart(3)}  ${barra} ${pct}%`);
    }
    console.log('──────────────────────────────────────────────────');
  } catch (err) {
    console.error('Error crítico:', err);
  } finally {
    await pg.end();
  }
}

simulate();
