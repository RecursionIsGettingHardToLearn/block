import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { DatabaseService } from '../../../src/database/database.service';

/**
 * Pruebas UNITARIAS del servicio de notificaciones push.
 *
 * Se aíslan las dependencias externas (base de datos y configuración) con
 * mocks, para probar la lógica del servicio sin conectarse a nada real.
 */
describe('NotificationsService (unitario)', () => {
  let service: NotificationsService;
  let db: { query: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    config = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DatabaseService, useValue: db },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get<NotificationsService>(NotificationsService);
  });

  it('se instancia correctamente', () => {
    expect(service).toBeDefined();
  });

  it('sin credenciales de Firebase, el push queda deshabilitado', () => {
    // onModuleInit no se llamó (no hay app.init), así que habilitado = false.
    expect(service.isEnabled()).toBe(false);
  });

  it('registrarDispositivo hace un upsert en la tabla dispositivos', async () => {
    await service.registrarDispositivo('usuario-1', 'token-abc-123', 'android');

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO dispositivos');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual(['usuario-1', 'token-abc-123', 'android']);
  });

  it('registrarDispositivo respeta la plataforma indicada (ios)', async () => {
    await service.registrarDispositivo('usuario-2', 'token-ios', 'ios');
    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('ios');
  });

  it('notificarVotoEmitido no consulta la BD si el push está deshabilitado', async () => {
    await service.notificarVotoEmitido('usuario-1', 'eleccion-1');
    // Al estar deshabilitado, retorna temprano sin buscar tokens.
    expect(db.query).not.toHaveBeenCalled();
  });

  it('notificarVotoEmitido nunca lanza aunque la BD falle', async () => {
    db.query.mockRejectedValueOnce(new Error('fallo de BD simulado'));
    await expect(
      service.notificarVotoEmitido('usuario-1', 'eleccion-1'),
    ).resolves.toBeUndefined();
  });
});
