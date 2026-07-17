import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ChatReportDto } from './dto/chat-report.dto';
import { ReportsAiService } from './reports-ai.service';
import { ReportsService } from './reports.service';

/** Solo los campos del archivo subido que este controlador necesita. */
interface AudioSubido {
  buffer: Buffer;
  originalname: string;
}

/** Cuerpo de la petición de síntesis de voz. */
interface SpeakBody {
  texto: string;
}

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

  /**
   * Voz → texto (Whisper). Recibe el audio grabado en el navegador y devuelve
   * el texto reconocido, para usarlo como pregunta del chat.
   */
  @Post('transcribe')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(@UploadedFile() audio?: AudioSubido) {
    if (!audio) {
      throw new ForbiddenException('No se recibió audio.');
    }
    const texto = await this.ai.transcribe(
      audio.buffer,
      audio.originalname || 'audio.webm',
    );
    return { texto };
  }

  /**
   * Texto → voz (TTS). Devuelve un MP3 con la respuesta leída, para que la
   * interfaz la reproduzca.
   */
  @Post('speak')
  @Roles('ADMINISTRADOR', 'AUDITOR')
  async speak(@Body() body: SpeakBody, @Res() res: Response) {
    const audio = await this.ai.synthesize(body.texto ?? '');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.send(audio);
  }
}
