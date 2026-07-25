import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NavQueryDto } from './dto/nav-query.dto';
import { NavAssistantService } from './nav-assistant.service';

/** Solo los campos del archivo subido que este controlador necesita. */
interface AudioSubido {
  buffer: Buffer;
  originalname: string;
}

@Controller('nav-assistant')
@UseGuards(JwtAuthGuard)
export class NavAssistantController {
  constructor(private readonly nav: NavAssistantService) {}

  /** ¿Está habilitado el asistente? (para mostrar el botón flotante o no.) */
  @Get('status')
  status() {
    return { enabled: this.nav.isEnabled() };
  }

  /**
   * Conversa con el asistente. El rol se lee del token: cada quien solo recibe
   * destinos que puede ver. El historial da continuidad a la conversación.
   */
  @Post('ask')
  ask(
    @Body() dto: NavQueryDto,
    @Req() req: Request & { user: { role: string } },
  ) {
    return this.nav.sugerir(req.user.role, dto.consulta, dto.historial ?? []);
  }

  /**
   * Voz → texto (Whisper) para hablarle al asistente. Devuelve el texto
   * reconocido, que se coloca en el campo para revisarlo antes de enviar.
   */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(@UploadedFile() audio?: AudioSubido) {
    if (!audio) {
      throw new ForbiddenException('No se recibió audio.');
    }
    const texto = await this.nav.transcribe(
      audio.buffer,
      audio.originalname || 'audio.webm',
    );
    return { texto };
  }
}
