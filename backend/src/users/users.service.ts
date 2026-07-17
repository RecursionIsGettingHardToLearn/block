import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export type RoleType = 'VOTANTE' | 'ADMINISTRADOR' | 'AUDITOR';

export interface User {
  id: string;
  identificador: string;
  ru: string;
  name: string;
  email: string;
  passwordHash: string;
  role: RoleType;
  career: string;
  isEnabled: boolean;
  hasVoted: boolean;
  channelNames: string[];
  createdAt: Date;
}

// Default org from seed data
const ORG_ID = '11111111-1111-1111-1111-111111111111';

function normalizeChannelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function mapUser(row: Record<string, unknown>, hasVoted = false): User {
  const meta = (row.metadatos as Record<string, string>) ?? {};
  return {
    id: row.id as string,
    identificador: row.identificador as string,
    ru: row.identificador as string,
    name: row.nombre as string,
    email: row.email as string,
    passwordHash: row.hash_contrasena as string,
    role: row.rol as RoleType,
    career: meta.carrera ?? '',
    isEnabled: row.habilitado as boolean,
    hasVoted,
    channelNames: normalizeChannelNames(row.canales_asignados),
    createdAt: row.creado_en as Date,
  };
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureUserChannelsTable();
  }

  async findByIdentificador(identificador: string): Promise<User | null> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT u.*,
        COALESCE(array_agg(uc.canal_fabric) FILTER (WHERE uc.canal_fabric IS NOT NULL), '{}') AS canales_asignados,
        EXISTS(
          SELECT 1 FROM recibos_voto rv
          WHERE rv.id_usuario = u.id AND rv.estado = 'CONFIRMADO'
        ) AS ha_votado
       FROM usuarios u
       LEFT JOIN usuario_canales uc ON uc.id_usuario = u.id
       WHERE u.identificador = $1
       GROUP BY u.id
       LIMIT 1`,
      [identificador],
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return mapUser(row, row.ha_votado as boolean);
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT u.*,
        COALESCE(array_agg(uc.canal_fabric) FILTER (WHERE uc.canal_fabric IS NOT NULL), '{}') AS canales_asignados,
        EXISTS(
          SELECT 1 FROM recibos_voto rv
          WHERE rv.id_usuario = u.id AND rv.estado = 'CONFIRMADO'
        ) AS ha_votado
       FROM usuarios u
       LEFT JOIN usuario_canales uc ON uc.id_usuario = u.id
       WHERE u.id = $1
       GROUP BY u.id
       LIMIT 1`,
      [id],
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return mapUser(row, row.ha_votado as boolean);
  }

  async findAll(): Promise<User[]> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT u.*,
        COALESCE(array_agg(uc.canal_fabric) FILTER (WHERE uc.canal_fabric IS NOT NULL), '{}') AS canales_asignados,
        EXISTS(
          SELECT 1 FROM recibos_voto rv
          WHERE rv.id_usuario = u.id AND rv.estado = 'CONFIRMADO'
        ) AS ha_votado
       FROM usuarios u
       LEFT JOIN usuario_canales uc ON uc.id_usuario = u.id
       WHERE u.id_organizacion = $1
       GROUP BY u.id
       ORDER BY u.creado_en DESC`,
      [ORG_ID],
    );
    return res.rows.map((row) => mapUser(row, row.ha_votado as boolean));
  }

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.db.query(
      `SELECT id FROM usuarios
       WHERE id_organizacion = $1 AND (identificador = $2 OR email = $3)
       LIMIT 1`,
      [ORG_ID, dto.identificador, dto.email],
    );
    if (exists.rows.length > 0) {
      throw new ConflictException(
        'El identificador o email ya está registrado',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const meta = dto.career ? JSON.stringify({ carrera: dto.career }) : '{}';

    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO usuarios
         (id_organizacion, identificador, nombre, email, hash_contrasena, rol, metadatos)
       VALUES ($1, $2, $3, $4, $5, $6::rol_usuario, $7::jsonb)
       RETURNING *`,
      [
        ORG_ID,
        dto.identificador,
        dto.name,
        dto.email,
        passwordHash,
        dto.role,
        meta,
      ],
    );
    const user = mapUser(res.rows[0]);
    await this.replaceUserChannels(user.id, dto.channelNames ?? []);
    return this.findById(user.id) as Promise<User>;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      setClauses.push(`nombre = $${idx++}`);
      params.push(dto.name);
    }
    if (dto.email !== undefined) {
      setClauses.push(`email = $${idx++}`);
      params.push(dto.email);
    }
    if (dto.role !== undefined) {
      setClauses.push(`rol = $${idx++}::rol_usuario`);
      params.push(dto.role);
    }
    if (dto.isEnabled !== undefined) {
      setClauses.push(`habilitado = $${idx++}`);
      params.push(dto.isEnabled);
    }
    if (dto.career !== undefined) {
      setClauses.push(`metadatos = metadatos || $${idx++}::jsonb`);
      params.push(JSON.stringify({ carrera: dto.career }));
    }
    if (dto.password) {
      setClauses.push(`hash_contrasena = $${idx++}`);
      params.push(await bcrypt.hash(dto.password, 10));
    }

    if (setClauses.length === 0 && dto.channelNames === undefined)
      return current;

    if (setClauses.length > 0) {
      params.push(id);
      await this.db.query<Record<string, unknown>>(
        `UPDATE usuarios SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
    }
    if (dto.channelNames !== undefined) {
      await this.replaceUserChannels(id, dto.channelNames);
    }

    const updated = await this.findById(id);
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return updated;
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.query('DELETE FROM usuarios WHERE id = $1', [id]);
    if (res.rowCount === 0)
      throw new NotFoundException('Usuario no encontrado');
  }

  async assertCanVote(userId: string, electionId: string): Promise<void> {
    const userRes = await this.db.query<{ habilitado: boolean }>(
      'SELECT habilitado FROM usuarios WHERE id = $1',
      [userId],
    );
    if (!userRes.rows[0]) throw new NotFoundException('Usuario no encontrado');
    if (!userRes.rows[0].habilitado)
      throw new UnauthorizedException('Cuenta deshabilitada');

    const channelRes = await this.db.query(
      `SELECT 1
       FROM elecciones e
       INNER JOIN usuario_canales uc ON uc.canal_fabric = e.canal_fabric
       WHERE e.id = $1 AND uc.id_usuario = $2
       LIMIT 1`,
      [electionId, userId],
    );
    if (channelRes.rows.length === 0) {
      throw new ForbiddenException(
        'No tienes acceso al canal de esta elección',
      );
    }

    const votoRes = await this.db.query(
      `SELECT id FROM recibos_voto
       WHERE id_usuario = $1 AND id_eleccion = $2 AND estado = 'CONFIRMADO'`,
      [userId, electionId],
    );
    if (votoRes.rows.length > 0)
      throw new ConflictException('El usuario ya emitió su voto');
  }

  async markAsVoted(userId: string, electionId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      const userRes = await client.query<{ habilitado: boolean }>(
        'SELECT habilitado FROM usuarios WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!userRes.rows[0])
        throw new NotFoundException('Usuario no encontrado');
      if (!userRes.rows[0].habilitado)
        throw new UnauthorizedException('Cuenta deshabilitada');

      const votoRes = await client.query(
        `SELECT id FROM recibos_voto
         WHERE id_usuario = $1 AND id_eleccion = $2 AND estado = 'CONFIRMADO'`,
        [userId, electionId],
      );
      if (votoRes.rows.length > 0)
        throw new ConflictException('El usuario ya emitió su voto');

      await client.query(
        `INSERT INTO padron_electoral (id_eleccion, id_usuario, voto_emitido, votado_en)
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (id_eleccion, id_usuario)
         DO UPDATE SET voto_emitido = true, votado_en = NOW()`,
        [electionId, userId],
      );
    });
  }

  private async ensureUserChannelsTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS usuario_canales (
        id_usuario UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        canal_fabric VARCHAR(100) NOT NULL REFERENCES canales_fabric(nombre) ON DELETE CASCADE,
        creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id_usuario, canal_fabric)
      )
    `);
  }

  /**
   * Asigna UN canal a varios usuarios de golpe, de forma aditiva: no borra los
   * canales que cada usuario ya tuviera. Devuelve cuántos quedaron asignados
   * (los que ya lo tenían no se cuentan como nuevos). El canal debe existir.
   */
  async assignChannelToMany(
    canal: string,
    usuarioIds: string[],
  ): Promise<{ asignados: number }> {
    await this.ensureUserChannelsTable();

    const { rows: canalRows } = await this.db.query<{ nombre: string }>(
      `SELECT nombre FROM canales_fabric WHERE nombre = $1`,
      [canal],
    );
    if (canalRows.length === 0) {
      throw new NotFoundException(`El canal ${canal} no existe`);
    }

    const ids = [...new Set(usuarioIds)];
    let asignados = 0;
    await this.db.transaction(async (client) => {
      for (const userId of ids) {
        const res = await client.query(
          `INSERT INTO usuario_canales (id_usuario, canal_fabric)
           VALUES ($1, $2)
           ON CONFLICT (id_usuario, canal_fabric) DO NOTHING`,
          [userId, canal],
        );
        asignados += res.rowCount ?? 0;
      }
    });
    return { asignados };
  }

  private async replaceUserChannels(
    userId: string,
    channelNames: string[],
  ): Promise<void> {
    await this.ensureUserChannelsTable();
    const uniqueChannels = [...new Set(channelNames.filter(Boolean))];

    await this.db.transaction(async (client) => {
      await client.query('DELETE FROM usuario_canales WHERE id_usuario = $1', [
        userId,
      ]);
      for (const channelName of uniqueChannels) {
        await client.query(
          `INSERT INTO usuario_canales (id_usuario, canal_fabric)
           VALUES ($1, $2)
           ON CONFLICT (id_usuario, canal_fabric) DO NOTHING`,
          [userId, channelName],
        );
      }
    });
  }
}
