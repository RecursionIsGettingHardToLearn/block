import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DB, describirConexion } from './db_config';

async function seed() {
  console.log(`Conexión → ${describirConexion()}`);
  const client = new Client(DB);

  try {
    await client.connect();
    console.log('Iniciando carga masiva de datos...');

    const ORG_ID = '11111111-1111-1111-1111-111111111111';
    const saltRounds = 10;
    const defaultPassword = await bcrypt.hash('password123', saltRounds);

    // 1. Limpiar datos previos (OPCIONAL: mantengo el admin que ya tienes)
    await client.query('DELETE FROM recibos_voto');
    await client.query('DELETE FROM padron_electoral');
    await client.query('DELETE FROM candidatos');
    await client.query('DELETE FROM elecciones');
    await client.query("DELETE FROM usuarios WHERE identificador != 'admin'");
    console.log('Tablas limpiadas.');

    // 1.5 Asegurar la organización (el admin conservado la referencia con FK
    // RESTRICT, así que no puede borrarse; si ya existe, no se toca)
    await client.query(
      `INSERT INTO organizaciones (id, nombre, slug) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, 'UAGRM', 'uagrm'],
    );
    console.log('Organización asegurada.');

    // 2. Crear 100 Usuarios
    console.log('Generando 100 usuarios...');
    const nombres = [
      'Grover',
      'Maria',
      'Carlos',
      'Ana',
      'Luis',
      'Elena',
      'Pedro',
      'Lucia',
      'Jose',
      'Carmen',
      'Miguel',
      'Sofia',
      'Jorge',
      'Isabel',
      'Raul',
      'Rosa',
      'Fernando',
      'Patricia',
      'Roberto',
      'Beatriz',
    ];
    const apellidos = [
      'Choque',
      'Villca',
      'Mamani',
      'Quispe',
      'Flores',
      'Vargas',
      'Gutierrez',
      'Rojas',
      'Lopez',
      'Garcia',
      'Mendoza',
      'Perez',
      'Huanca',
      'Torres',
      'Sánchez',
      'Ramirez',
      'Cruz',
      'Gomez',
      'Alvarez',
      'Romero',
    ];
    const carreras = ['SISTEMAS', 'INFORMATICA', 'REDES'];

    const userIds: string[] = [];

    for (let i = 1; i <= 100; i++) {
      const nombre = nombres[i % nombres.length];
      const apellido = apellidos[i % apellidos.length];
      const full_name = `${nombre} ${apellido} ${i}`;
      const identificador = (21900000 + i).toString();
      const email = `${nombre.toLowerCase()}${i}@uagrm.edu.bo`;
      const rol = i <= 5 ? 'ADMINISTRADOR' : i <= 10 ? 'AUDITOR' : 'VOTANTE';
      const carrera = carreras[i % carreras.length];
      const metadatos = JSON.stringify({ carrera: carrera });

      const res = await client.query(
        `INSERT INTO usuarios (id_organizacion, identificador, nombre, email, hash_contrasena, rol, metadatos) 
                 VALUES ($1, $2, $3, $4, $5, $6::rol_usuario, $7::jsonb) RETURNING id`,
        [
          ORG_ID,
          identificador,
          full_name,
          email,
          defaultPassword,
          rol,
          metadatos,
        ],
      );
      userIds.push(res.rows[0].id);
    }

    // 3. Crear 5 Elecciones
    console.log('Generando 5 elecciones...');
    const eleccionesData = [
      { titulo: 'Elección de Rectorado 2026', cargo: 'Rector y Vicerrector' },
      { titulo: 'Elección de Decano FICCT 2026', cargo: 'Decano y Vicedecano' },
      { titulo: 'Elecciones FUL 2026', cargo: 'Delegados FUL' },
      { titulo: 'Elecciones ICU Estudiantil', cargo: 'Delegados ICU' },
      {
        titulo: 'Elecciones Centro de Estudiantes - Sistemas',
        cargo: 'Secretario Ejecutivo',
      },
    ];

    for (const e of eleccionesData) {
      const electionId = crypto.randomUUID();
      const inicio = new Date();
      inicio.setHours(inicio.getHours() - 1);
      const fin = new Date();
      fin.setDate(fin.getDate() + 2);

      await client.query(
        `INSERT INTO elecciones (id, id_organizacion, titulo, descripcion, nombre_cargo, fecha_inicio, fecha_fin, estado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVA')`,
        [
          electionId,
          ORG_ID,
          e.titulo,
          `Proceso democrático para ${e.titulo}`,
          e.cargo,
          inicio,
          fin,
        ],
      );

      // 4. Candidatos para cada elección
      const frentes = [
        'Frente de Integración',
        'Innovación Universitaria',
        'Unión Estudiantil',
      ];
      for (let j = 0; j < frentes.length; j++) {
        await client.query(
          `INSERT INTO candidatos (id_eleccion, nombre_frente, nombre_candidato, nombre_cargo, orden_boleta)
                     VALUES ($1, $2, $3, $4, $5)`,
          [electionId, frentes[j], `Candidato ${frentes[j]}`, e.cargo, j + 1],
        );
      }

      // 5. Inscribir a todos los 100 usuarios en el padrón de cada elección
      console.log(`Inscribiendo usuarios en ${e.titulo}...`);
      for (const uid of userIds) {
        await client.query(
          'INSERT INTO padron_electoral (id_eleccion, id_usuario) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [electionId, uid],
        );
      }
    }

    console.log('¡Carga masiva completada con éxito!');
    console.log('-----------------------------------');
    console.log('Resumen:');
    console.log('- Usuarios: 100 creados (21900001 - 21900100)');
    console.log('- Elecciones: 5 activas');
    console.log('- Contraseña general: password123');
  } catch (err) {
    console.error('Error durante la carga masiva:', err);
  } finally {
    await client.end();
  }
}

seed();
