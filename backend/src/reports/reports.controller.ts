import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportsAiService } from './reports-ai.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly ai: ReportsAiService,
  ) {}

  /** ¿Está habilitada la IA? (para que la interfaz muestre el generador o no.) */
  @Get('ai-status')
  aiStatus() {
    return { enabled: this.ai.isEnabled() };
  }

  /** Reporte de toda la red — solo ADMINISTRADOR. */
  @Get('network')
  @Roles('ADMINISTRADOR')
  getNetwork() {
    return this.reports.getNetworkReport();
  }

  /** Reporte de una elección — ADMINISTRADOR o AUDITOR. */
  @Get('election/:id')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  getElection(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.getElectionReport(id);
  }

  /**
   * Genera una visualización de reporte a partir de una petición en lenguaje
   * natural. El backend recopila los datos (no confía en el cliente) según el
   * tipo, con permiso por rol: 'red' es exclusivo del admin; 'eleccion' lo
   * usan admin y auditor. Devuelve una spec que el frontend renderiza como
   * gráfico o tabla.
   */
  @Post('generate')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  async generate(
    @Body() dto: GenerateReportDto,
    @Req() req: Request & { user: { role: string } },
  ) {
    let contexto: unknown;
    if (dto.tipo === 'red') {
      if (req.user.role !== 'ADMINISTRADOR') {
        throw new ForbiddenException(
          'Solo el administrador puede generar reportes de red.',
        );
      }
      contexto = await this.reports.getNetworkReport();
    } else {
      if (!dto.electionId) {
        throw new ForbiddenException(
          'Para un reporte de elección se requiere electionId.',
        );
      }
      contexto = await this.reports.getElectionReport(dto.electionId);
    }

    const spec = await this.ai.generarReporte(contexto, dto.tipo, dto.peticion);
    return spec;
  }
}
