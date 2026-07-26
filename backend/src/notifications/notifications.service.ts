import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import {
  cert,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { BatchResponse, getMessaging } from 'firebase-admin/messaging';
import { DatabaseService } from '../database/database.service';

/**
 * Notificaciones push a los dispositivos móviles (Firebase Cloud Messaging).
 *
 * Degradación segura: si no hay credenciales de Firebase configuradas
 * (FIREBASE_CREDENTIALS_PATH), el servicio queda deshabilitado y todos sus
 * métodos son no-ops que no lanzan. Así el resto de la app —en particular la
 * emisión de votos— funciona igual aunque el push todavía no esté montado.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private habilitado = false;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  onModuleInit(): void {
    const ruta = this.config.get<string>('FIREBASE_CREDENTIALS_PATH');
    if (!ruta) {
      this.logger.warn(
        'FIREBASE_CREDENTIALS_PATH no configurado; las notificaciones push están deshabilitadas.',
      );
      return;
    }
    try {
      const cuenta = JSON.parse(readFileSync(ruta, 'utf8')) as ServiceAccount;
      if (getApps().length === 0) {
        initializeApp({ credential: cert(cuenta) });
      }
      this.habilitado = true;
      this.logger.log('Notificaciones push habilitadas (FCM).');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`No se pudo inicializar Firebase Admin: ${msg}`);
    }
  }

  /** ¿Está el push configurado? (por si la interfaz quiere mostrarlo). */
  isEnabled(): boolean {
    return this.habilitado;
  }

  /**
   * Registra (o actualiza) el token de un dispositivo para un usuario. Si el
   * token ya existía, lo reasigna a este usuario y refresca la fecha.
   */
  async registrarDispositivo(
    userId: string,
    token: string,
    plataforma: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO dispositivos (id_usuario, token, plataforma)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET id_usuario = EXCLUDED.id_usuario,
             plataforma = EXCLUDED.plataforma,
             actualizado_en = NOW()`,
      [userId, token, plataforma],
    );
  }

  /** Tokens de todos los dispositivos de un usuario. */
  private async tokensDe(userId: string): Promise<string[]> {
    const res = await this.db.query<{ token: string }>(
      'SELECT token FROM dispositivos WHERE id_usuario = $1',
      [userId],
    );
    return res.rows.map((r) => r.token);
  }

  /** Borra tokens que FCM reportó como inválidos (dispositivos desinstalados). */
  private async limpiarTokensInvalidos(
    tokens: string[],
    respuesta: BatchResponse,
  ): Promise<void> {
    const invalidos: string[] = [];
    respuesta.responses.forEach((r, i) => {
      const code = r.success ? '' : (r.error?.code ?? '');
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        invalidos.push(tokens[i]);
      }
    });
    if (invalidos.length > 0) {
      await this.db.query('DELETE FROM dispositivos WHERE token = ANY($1)', [
        invalidos,
      ]);
    }
  }

  /**
   * Avisa al votante que su voto quedó registrado en la blockchain. Fire-and-
   * forget: captura cualquier error internamente y nunca lanza, para no afectar
   * el flujo de emisión del voto.
   */
  async notificarVotoEmitido(
    userId: string,
    electionId: string,
  ): Promise<void> {
    try {
      if (!this.habilitado) return;
      const tokens = await this.tokensDe(userId);
      if (tokens.length === 0) return;

      const respuesta = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: 'Voto registrado',
          body: 'Tu voto quedó registrado en la blockchain.',
        },
        data: { tipo: 'voto_emitido', electionId },
      });

      await this.limpiarTokensInvalidos(tokens, respuesta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error enviando notificación de voto: ${msg}`);
    }
  }
}
