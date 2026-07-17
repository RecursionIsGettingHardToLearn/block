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
import { ChatReportDto } from './dto/chat-report.dto';
import { ReportsAiService } from './reports-ai.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly ai: ReportsAiService,
  ) {}

  /** ¿Está habilitado el chat con IA? (para que la interfaz lo muestre o no.) */
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
   * Chat con IA sobre un reporte. El backend recopila los datos (no confía en
   * los que mande el cliente) según el tipo, aplicando el permiso por rol:
   * 'red' es exclusivo del admin; 'eleccion' lo pueden usar admin y auditor.
   */
  @Post('chat')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  async chat(
    @Body() dto: ChatReportDto,
    @Req() req: Request & { user: { role: string } },
  ) {
    // Recopilar el contexto en el servidor evita que el cliente inyecte datos
    // falsos en el prompt.
    let contexto: unknown;
    if (dto.tipo === 'red') {
      // El reporte de red es exclusivo del administrador, aunque el chat lo
      // compartan ambos roles.
      if (req.user.role !== 'ADMINISTRADOR') {
        throw new ForbiddenException(
          'Solo el administrador puede consultar el reporte de red.',
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

    const respuesta = await this.ai.chat(
      contexto,
      dto.tipo,
      dto.historial ?? [],
      dto.pregunta,
    );
    return { respuesta };
  }
}
