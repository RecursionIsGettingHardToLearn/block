import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateElectionDto } from './dto/create-election.dto';
import { UpdateElectionStatusDto } from './dto/update-election-status.dto';

export type ElectionStatus =
  | 'BORRADOR'
  | 'PROGRAMADA'
  | 'ACTIVA'
  | 'CERRADA'
  | 'ESCRUTADA';

const VALID_TRANSITIONS: Record<ElectionStatus, ElectionStatus[]> = {
  BORRADOR: ['PROGRAMADA'],
  PROGRAMADA: ['ACTIVA'],
  ACTIVA: ['CERRADA'],
  CERRADA: ['ESCRUTADA'],
  ESCRUTADA: [],
};

// Default org from seed data
const ORG_ID = '11111111-1111-1111-1111-111111111111';

export interface Candidate {
  id: string;
  electionId: string;
  frontName: string;
  candidateName: string;
  position: string;
  photoUrl: string | null;
  mission: string | null;
  logoFrente: string | null;
  createdAt: Date;
}

export interface Election {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  status: ElectionStatus;
  channelName: string;
  createdAt: Date;
  candidates: Candidate[];
}

function mapCandidate(row: Record<string, unknown>): Candidate {
  return {
    id: row.id as string,
    electionId: row.id_eleccion as string,
    frontName: row.nombre_frente as string,
    candidateName: row.nombre_candidato as string,
    position: (row.nombre_cargo as string) ?? '',
    photoUrl: (row.url_foto as string) ?? null,
    mission: (row.mision as string) ?? null,
    logoFrente: (row.logo_frente as string) ?? null,
    createdAt: row.creado_en as Date,
  };
}

function mapElection(
  row: Record<string, unknown>,
  candidates: Candidate[] = [],
): Election {
  return {
    id: row.id as string,
    title: row.titulo as string,
    description: (row.descripcion as string) ?? null,
    startDate: row.fecha_inicio as Date,
    endDate: row.fecha_fin as Date,
    status: row.estado as ElectionStatus,
    channelName: (row.canal_fabric as string) ?? 'evoting',
    createdAt: row.creado_en as Date,
    candidates,
  };
}

@Injectable()
export class ElectionsService {
  private readonly logger = new Logger(ElectionsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly fabricService: FabricService,
  ) {}

  // ── Elections ────────────────────────────────────────────────────────────

  async createElection(dto: CreateElectionDto): Promise<Election> {
    const channel = dto.channelName ?? 'evoting';
    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO elecciones (id_organizacion, titulo, descripcion, fecha_inicio, fecha_fin, estado, canal_fabric)
       VALUES ($1, $2, $3, $4, $5, 'PROGRAMADA', $6)
       RETURNING *`,
      [
        ORG_ID,
        dto.title,
        dto.description ?? null,
        dto.startDate,
        dto.endDate,
        channel,
      ],
    );
    return mapElection(res.rows[0]);
  }

  async findAllElections(): Promise<Election[]> {
    const electRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM elecciones WHERE id_organizacion = $1 ORDER BY creado_en DESC`,
      [ORG_ID],
    );
    if (electRes.rows.length === 0) return [];

    const ids = electRes.rows.map((r) => r.id as string);
    const candRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM candidatos WHERE id_eleccion = ANY($1::uuid[]) ORDER BY orden_boleta ASC, creado_en ASC`,
      [ids],
    );

    const candidatesByElection = new Map<string, Candidate[]>();
    for (const row of candRes.rows) {
      const eid = row.id_eleccion as string;
      if (!candidatesByElection.has(eid)) candidatesByElection.set(eid, []);
      candidatesByElection.get(eid)!.push(mapCandidate(row));
    }

    return electRes.rows.map((row) =>
      mapElection(row, candidatesByElection.get(row.id as string) ?? []),
    );
  }

  async findCurrentVoterElections(userId: string): Promise<Election[]> {
    const electRes = await this.db.query<Record<string, unknown>>(
      `SELECT e.*
       FROM elecciones e
       INNER JOIN usuario_canales uc ON uc.canal_fabric = e.canal_fabric
       WHERE e.id_organizacion = $1
         AND e.estado = 'ACTIVA'
         AND uc.id_usuario = $2
       ORDER BY e.creado_en DESC`,
      [ORG_ID, userId],
    );
    if (electRes.rows.length === 0) return [];

    const ids = electRes.rows.map((r) => r.id as string);
    const candRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM candidatos WHERE id_eleccion = ANY($1::uuid[]) ORDER BY orden_boleta ASC, creado_en ASC`,
      [ids],
    );

    const candidatesByElection = new Map<string, Candidate[]>();
    for (const row of candRes.rows) {
      const eid = row.id_eleccion as string;
      if (!candidatesByElection.has(eid)) candidatesByElection.set(eid, []);
      candidatesByElection.get(eid)!.push(mapCandidate(row));
    }

    return electRes.rows.map((row) =>
      mapElection(row, candidatesByElection.get(row.id as string) ?? []),
    );
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

  async findElectionById(id: string): Promise<Election> {
    const electRes = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM elecciones WHERE id = $1',
      [id],
    );
    if (!electRes.rows[0])
      throw new NotFoundException(`Elección ${id} no encontrada`);

    const candRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM candidatos WHERE id_eleccion = $1 ORDER BY orden_boleta ASC, creado_en ASC`,
      [id],
    );
    return mapElection(electRes.rows[0], candRes.rows.map(mapCandidate));
  }

  async updateStatus(
    id: string,
    dto: UpdateElectionStatusDto,
  ): Promise<Election> {
    const election = await this.findElectionById(id);
    const allowed = VALID_TRANSITIONS[election.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transición inválida: ${election.status} → ${dto.status}. ` +
          `Permitidas: ${allowed.join(', ') || 'ninguna'}`,
      );
    }

    if (dto.status === 'ACTIVA') {
      try {
        await this.fabricService.initEleccion(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `initEleccion falló para ${id}; no se activará porque Fabric no escribió en CouchDB: ${message}`,
        );
        throw new ServiceUnavailableException(
          `Fabric no pudo inicializar la elección en el canal ${election.channelName}: ${message}`,
        );
      }
    }

    const res = await this.db.query<Record<string, unknown>>(
      `UPDATE elecciones SET estado = $1::estado_eleccion WHERE id = $2 RETURNING *`,
      [dto.status, id],
    );

    if (dto.status === 'CERRADA') {
      try {
        await this.fabricService.cerrarEleccion(id);
      } catch (err) {
        this.logger.error(
          `cerrarEleccion falló para ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const candRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM candidatos WHERE id_eleccion = $1 ORDER BY orden_boleta ASC, creado_en ASC`,
      [id],
    );
    return mapElection(res.rows[0], candRes.rows.map(mapCandidate));
  }

  async deleteElection(id: string): Promise<void> {
    const election = await this.findElectionById(id);
    if (election.status !== 'PROGRAMADA') {
      throw new BadRequestException(
        'Solo se pueden eliminar elecciones en estado PROGRAMADA',
      );
    }
    await this.db.query('DELETE FROM elecciones WHERE id = $1', [id]);
  }

  async closeExpiredElections(): Promise<number> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM elecciones WHERE estado = 'ACTIVA' AND fecha_fin < NOW()`,
    );
    for (const { id } of rows) {
      try {
        await this.updateStatus(id, { status: 'CERRADA' });
        this.logger.log(
          `Auto-cierre: elección ${id} cerrada por vencimiento de plazo`,
        );
      } catch (err) {
        this.logger.error(
          `Auto-cierre fallido para ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return rows.length;
  }

  // ── Candidates ───────────────────────────────────────────────────────────

  async createCandidate(dto: CreateCandidateDto): Promise<Candidate> {
    const election = await this.findElectionById(dto.electionId);
    if (election.status !== 'PROGRAMADA') {
      throw new BadRequestException(
        'Solo se pueden agregar candidatos a elecciones en estado PROGRAMADA',
      );
    }

    // Una misma persona no puede postularse dos veces en la misma elección.
    // El modelo identifica al candidato por su nombre (no hay CI ni vínculo a
    // usuarios), así que se compara el nombre sin distinguir mayúsculas ni
    // espacios de más. La restricción también vive en la base (ver
    // migración 0003) como red de seguridad ante inserciones concurrentes.
    const duplicado = await this.db.query<{ id: string }>(
      `SELECT id FROM candidatos
       WHERE id_eleccion = $1
         AND LOWER(regexp_replace(TRIM(nombre_candidato), '\s+', ' ', 'g'))
           = LOWER(regexp_replace(TRIM($2), '\s+', ' ', 'g'))`,
      [dto.electionId, dto.candidateName],
    );
    if (duplicado.rows.length > 0) {
      throw new BadRequestException(
        `${dto.candidateName.trim()} ya está registrado como candidato en esta elección.`,
      );
    }

    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO candidatos (id_eleccion, nombre_frente, nombre_candidato, nombre_cargo, url_foto, mision, logo_frente)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        dto.electionId,
        dto.frontName,
        dto.candidateName,
        dto.position,
        dto.photoUrl ?? null,
        dto.mission ?? null,
        dto.logoFrente ?? null,
      ],
    );
    return mapCandidate(res.rows[0]);
  }

  async findCandidatesByElection(electionId: string): Promise<Candidate[]> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM candidatos WHERE id_eleccion = $1 ORDER BY orden_boleta ASC, creado_en ASC`,
      [electionId],
    );
    return res.rows.map(mapCandidate);
  }

  async findCandidateById(id: string): Promise<Candidate> {
    const res = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM candidatos WHERE id = $1',
      [id],
    );
    if (!res.rows[0])
      throw new NotFoundException(`Candidato ${id} no encontrado`);
    return mapCandidate(res.rows[0]);
  }

  async deleteCandidate(id: string): Promise<void> {
    const candidate = await this.findCandidateById(id);
    const election = await this.findElectionById(candidate.electionId);
    if (election.status !== 'PROGRAMADA') {
      throw new BadRequestException(
        'Solo se pueden eliminar candidatos de elecciones en estado PROGRAMADA',
      );
    }
    await this.db.query('DELETE FROM candidatos WHERE id = $1', [id]);
  }
}
