import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { NotificationsService } from './notifications.service';

/**
 * Registro de dispositivos para notificaciones push. La app móvil manda aquí su
 * token de FCM tras el login, para que el backend sepa a qué dispositivo enviar.
 */
@Controller('dispositivos')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  async registrar(
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: RegisterDeviceDto,
  ): Promise<{ ok: boolean }> {
    await this.notifications.registrarDispositivo(
      req.user.userId,
      dto.token,
      dto.plataforma ?? 'android',
    );
    return { ok: true };
  }
}
