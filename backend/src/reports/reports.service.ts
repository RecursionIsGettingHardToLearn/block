import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** Resumen de la red completa, para el reporte del ADMINISTRADOR. */
export interface NetworkReport {
  generadoEn: string;
  usuarios: { total: number; porRol: Record<string, number> };
  elecciones: { total: number; porEstado: Record<string, number> };
  canales: { nombre: string; descripcion: string | null; activo: boolean }[];
  nodos: { nombre: string; endpoint: string; activo: boolean }[];
  votos: { confirmados: number; pendientes: number; fallidos: number };
}

/** Reporte de una elección, para el AUDITOR. */
export interface ElectionReport {
  generadoEn: string;
  eleccion: {
    id: string;
    titulo: string;
    estado: string;
    canal: string;
    inicio: string;
    fin: string;
  };
  padron: { total: number; votaron: number; noVotaron: number };
  participacionPct: number;
  // El desglose por candidato solo se incluye si la elección ya cerró: mientras
  // esté ACTIVA, un reporte no debe filtrar quién va ganando.
  resultados:
    | { disponible: false; motivo: string }
    | {
        disponible: true;
        candidatos: { nombre: string; frente: string; votos: number }[];
        blancos: number;
        nulos: number;
      };
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  /** Estado agregado de toda la red. */
  async getNetworkReport(): Promise<NetworkReport> {
    const [usuarios, elecciones, canales, nodos, votos] = await Promise.all([
      this.db.query<{ rol: string; count: string }>(
        `SELECT rol, COUNT(*) AS count FROM usuarios GROUP BY rol`,
      ),
      this.db.query<{ estado: string; count: string }>(
        `SELECT estado, COUNT(*) AS count FROM elecciones GROUP BY estado`,
      ),
      this.db.query<{
        nombre: string;
        descripcion: string | null;
        activo: boolean;
      }>(
        `SELECT nombre, descripcion, activo FROM canales_fabric ORDER BY creado_en`,
      ),
      this.db.query<{ nombre: string; endpoint: string; activo: boolean }>(
        `SELECT nombre, endpoint, activo FROM nodos_fabric ORDER BY prioridad`,
      ),
      this.db.query<{ estado: string; count: string }>(
        `SELECT estado, COUNT(*) AS count FROM recibos_voto GROUP BY estado`,
      ),
    ]);

    const porRol: Record<string, number> = {};
    let totalUsuarios = 0;
    for (const r of usuarios.rows) {
      porRol[r.rol] = parseInt(r.count, 10);
      totalUsuarios += porRol[r.rol];
    }

    const porEstado: Record<string, number> = {};
    let totalElecciones = 0;
    for (const r of elecciones.rows) {
      porEstado[r.estado] = parseInt(r.count, 10);
      totalElecciones += porEstado[r.estado];
    }

    const votoPorEstado: Record<string, number> = {};
    for (const r of votos.rows) {
      votoPorEstado[r.estado] = parseInt(r.count, 10);
    }

    return {
      generadoEn: new Date().toISOString(),
      usuarios: { total: totalUsuarios, porRol },
      elecciones: { total: totalElecciones, porEstado },
      canales: canales.rows,
      nodos: nodos.rows,
      votos: {
        confirmados: votoPorEstado['CONFIRMADO'] ?? 0,
        pendientes: votoPorEstado['PENDIENTE'] ?? 0,
        fallidos: votoPorEstado['FALLIDO'] ?? 0,
      },
    };
  }

  /** Reporte de participación y (si cerró) resultados de una elección. */
  async getElectionReport(electionId: string): Promise<ElectionReport> {
    const elecRes = await this.db.query<{
      id: string;
      titulo: string;
      estado: string;
      canal_fabric: string;
      fecha_inicio: Date;
      fecha_fin: Date;
    }>(
      `SELECT id, titulo, estado, canal_fabric, fecha_inicio, fecha_fin
       FROM elecciones WHERE id = $1`,
      [electionId],
    );
    const elec = elecRes.rows[0];
    if (!elec) throw new NotFoundException('Elección no encontrada');

    // Padrón: votantes asignados al canal de la elección, y cuántos votaron.
    const padronRes = await this.db.query<{ total: string; votaron: string }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE EXISTS(
           SELECT 1 FROM recibos_voto rv
           WHERE rv.id_usuario = u.id AND rv.id_eleccion = $1
             AND rv.estado = 'CONFIRMADO'
         )) AS votaron
       FROM usuarios u
       INNER JOIN usuario_canales uc ON uc.id_usuario = u.id
       WHERE uc.canal_fabric = $2 AND u.rol = 'VOTANTE'`,
      [electionId, elec.canal_fabric],
    );
    const total = parseInt(padronRes.rows[0]?.total ?? '0', 10);
    const votaron = parseInt(padronRes.rows[0]?.votaron ?? '0', 10);

    const cerrada = elec.estado === 'CERRADA' || elec.estado === 'ESCRUTADA';
    let resultados: ElectionReport['resultados'];
    if (!cerrada) {
      resultados = {
        disponible: false,
        motivo:
          'La elección aún no ha cerrado; los resultados por candidato se revelan al cierre.',
      };
    } else {
      const candRes = await this.db.query<{
        nombre: string;
        frente: string;
        votos: string;
      }>(
        `SELECT c.nombre_candidato AS nombre, c.nombre_frente AS frente,
                COUNT(rv.id_candidato) AS votos
         FROM candidatos c
         LEFT JOIN recibos_voto rv
           ON rv.id_candidato = c.id AND rv.estado = 'CONFIRMADO'
         WHERE c.id_eleccion = $1
         GROUP BY c.id, c.nombre_candidato, c.nombre_frente
         ORDER BY votos DESC`,
        [electionId],
      );
      const espRes = await this.db.query<{ blancos: string; nulos: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE tipo_voto_especial = 'votos_blancos') AS blancos,
           COUNT(*) FILTER (WHERE tipo_voto_especial = 'votos_nulos') AS nulos
         FROM recibos_voto
         WHERE id_eleccion = $1 AND estado = 'CONFIRMADO'`,
        [electionId],
      );
      resultados = {
        disponible: true,
        candidatos: candRes.rows.map((r) => ({
          nombre: r.nombre,
          frente: r.frente,
          votos: parseInt(r.votos, 10),
        })),
        blancos: parseInt(espRes.rows[0]?.blancos ?? '0', 10),
        nulos: parseInt(espRes.rows[0]?.nulos ?? '0', 10),
      };
    }

    return {
      generadoEn: new Date().toISOString(),
      eleccion: {
        id: elec.id,
        titulo: elec.titulo,
        estado: elec.estado,
        canal: elec.canal_fabric,
        inicio: elec.fecha_inicio.toISOString(),
        fin: elec.fecha_fin.toISOString(),
      },
      padron: { total, votaron, noVotaron: total - votaron },
      participacionPct:
        total > 0 ? Math.round((votaron / total) * 1000) / 10 : 0,
      resultados,
    };
  }
}
