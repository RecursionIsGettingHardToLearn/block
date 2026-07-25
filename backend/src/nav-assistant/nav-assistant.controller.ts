import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NavQueryDto } from './dto/nav-query.dto';
import { NavAssistantService } from './nav-assistant.service';

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
   * Sugiere a dónde ir según lo que el usuario quiere hacer. El rol se lee del
   * token: cada quien solo recibe destinos que puede ver.
   */
  @Post('ask')
  ask(
    @Body() dto: NavQueryDto,
    @Req() req: Request & { user: { role: string } },
  ) {
    return this.nav.sugerir(req.user.role, dto.consulta);
  }
}
