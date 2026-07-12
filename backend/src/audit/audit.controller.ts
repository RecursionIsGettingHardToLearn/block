import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DatabaseService } from '../database/database.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ADMINISTRADOR', 'AUDITOR')
export class AuditController {
  constructor(private readonly db: DatabaseService) {}

  @Get('logs')
  async findAll(@Query('electionId') electionId?: string) {
    const query = `
      SELECT
        id,
        id_usuario        AS "userId",
        id_eleccion       AS "electionId",
        id_transaccion    AS "txId",
        estado            AS "status",
        mensaje_error     AS "errorMessage",
        creado_en         AS "createdAt"
      FROM recibos_voto
      ${electionId ? 'WHERE id_eleccion = $1' : ''}
      ORDER BY creado_en DESC
      ${electionId ? 'LIMIT 100' : 'LIMIT 500'}
    `;
    const res = await this.db.query<Record<string, unknown>>(
      query,
      electionId ? [electionId] : [],
    );
    return res.rows.map((row) => {
      const createdAt = row.createdAt as Date | string;
      return {
        ...row,
        createdAt:
          createdAt instanceof Date
            ? createdAt.toISOString()
            : new Date(createdAt).toISOString(),
      };
    });
  }
}
