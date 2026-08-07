import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { TestPushDto } from './dto/test-push.dto';
import { NotificationsService } from './notifications.service';

interface AuthRequest extends Request {
  user: { userId: string };
}

/**
 * Registro de dispositivos para notificaciones push y endpoint de prueba.
 */
@Controller('dispositivos')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Registra (o actualiza) el token FCM del dispositivo del usuario. */
  @Post()
  async registrar(
    @Req() req: AuthRequest,
    @Body() dto: RegisterDeviceDto,
  ): Promise<{ ok: boolean }> {
    await this.notifications.registrarDispositivo(
      req.user.userId,
      dto.token,
      dto.plataforma ?? 'android',
    );
    return { ok: true };
  }

  /**
   * Dispara una notificación push de prueba al dispositivo del usuario
   * autenticado. No requiere elección ni voto real.
   *
   * Body (todo opcional):
   *   { "titulo": "...", "cuerpo": "..." }
   *
   * Respuesta:
   *   { enviado: true, dispositivos: 1 }            → llegó al teléfono
   *   { enviado: false, dispositivos: 0, motivo }   → qué falta configurar
   */
  @Post('test-push')
  async testPush(
    @Req() req: AuthRequest,
    @Body() dto: TestPushDto,
  ): Promise<{ enviado: boolean; dispositivos: number; motivo?: string }> {
    return this.notifications.notificarPrueba(
      req.user.userId,
      dto.titulo ?? '🔔 Prueba de notificación',
      dto.cuerpo ?? 'Las notificaciones push están funcionando correctamente.',
    );
  }
}
