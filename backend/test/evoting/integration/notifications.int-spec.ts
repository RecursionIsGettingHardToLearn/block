import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { NotificationsController } from '../../../src/notifications/notifications.controller';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { JwtAuthGuard } from '../../../src/auth/jwt-auth.guard';

/**
 * Pruebas de INTEGRACIÓN del registro de dispositivos para push. Se levanta el
 * controlador real con supertest; el guard de JWT se simula inyectando un
 * usuario de prueba, y el servicio se reemplaza por un mock.
 */
describe('NotificationsController (integración)', () => {
  let app: INestApplication;
  let server: Server;

  const notifMock = {
    registrarDispositivo: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notifMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx
            .switchToHttp()
            .getRequest<{ user?: { userId: string } }>();
          req.user = { userId: 'usuario-de-prueba' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('POST /dispositivos registra el token del usuario autenticado', async () => {
    const res = await request(server).post('/dispositivos').send({
      token: 'fcm-token-suficientemente-largo',
      plataforma: 'android',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(notifMock.registrarDispositivo).toHaveBeenCalledWith(
      'usuario-de-prueba',
      'fcm-token-suficientemente-largo',
      'android',
    );
  });

  it('usa android por defecto si no se envía plataforma', async () => {
    await request(server)
      .post('/dispositivos')
      .send({ token: 'otro-token-suficientemente-largo' });

    const args = notifMock.registrarDispositivo.mock.calls[0] as unknown[];
    expect(args[2]).toBe('android');
  });

  it('rechaza un token demasiado corto (validación del DTO)', async () => {
    const res = await request(server)
      .post('/dispositivos')
      .send({ token: 'x' });
    expect(res.status).toBe(400);
  });

  it('rechaza una plataforma no permitida', async () => {
    const res = await request(server).post('/dispositivos').send({
      token: 'fcm-token-suficientemente-largo',
      plataforma: 'windows',
    });
    expect(res.status).toBe(400);
  });
});
