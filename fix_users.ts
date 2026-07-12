import { Client } from 'pg';
import * as bcrypt from 'bcrypt';

async function fix() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'muerte',
    database: 'evoting_db',
  });

  try {
    await client.connect();
    console.log('Conectado para reparar usuarios...');

    const saltRounds = 10;
    const adminHash = await bcrypt.hash('admin123', saltRounds);
    const voterHash = await bcrypt.hash('estudiante123', saltRounds);
    const auditorHash = await bcrypt.hash('auditor123', saltRounds);

    // Limpiar usuarios actuales para evitar conflictos de ID o duplicados
    await client.query('DELETE FROM usuarios');
    console.log('Usuarios antiguos eliminados.');

    // Insertar usuarios con hashes garantizados
    const orgId = '00000000-0000-0000-0000-000000000001';

    await client.query(
      `
            INSERT INTO usuarios (id_organizacion, identificador, nombre, email, hash_contrasena, rol)
            VALUES 
            ($1, 'admin', 'Admin FICCT', 'admin@ficct.edu.bo', $2, 'ADMINISTRADOR'),
            ($1, 'estudiante1', 'Juan Perez', 'juan@ficct.edu.bo', $3, 'VOTANTE'),
            ($1, 'auditor', 'Auditor Externo', 'auditor@ficct.edu.bo', $4, 'AUDITOR')
        `,
      [orgId, adminHash, voterHash, auditorHash],
    );

    console.log('¡Usuarios reparados con éxito!');
    console.log('Admin: admin / admin123');
    console.log('Votante: estudiante1 / estudiante123');
  } catch (err) {
    console.error('Error reparando usuarios:', err);
  } finally {
    await client.end();
  }
}

fix();
