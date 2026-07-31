import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { AiController } from '../../../src/ai/ai.controller';
import { AnomalyService } from '../../../src/ai/anomaly.service';
import { JwtAuthGuard } from '../../../src/auth/jwt-auth.guard';
import { RolesGuard } from '../../../src/auth/roles.guard';

/**
 * Pruebas de INTEGRACIÓN de la sección IA: se levanta el controlador real con
 * supertest, con el servicio y los guards simulados, y se verifican las rutas
 * HTTP de extremo a extremo (routing, códigos de estado y cuerpo).
 */
describe('AiController (integración)', () => {
  let app: INestApplication;
  let server: Server;

  const anomalyMock = {
    estado: jest.fn(),
    entrenar: jest.fn(),
    detectar: jest.fn(),
    subirModelo: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AnomalyService, useValue: anomalyMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ai/status devuelve el estado del modelo', async () => {
    anomalyMock.estado.mockResolvedValueOnce({ entrenado: false });
    const res = await request(server).get('/ai/status');
    expect(res.status).toBe(200);
    expect((res.body as { entrenado: boolean }).entrenado).toBe(false);
  });

  it('POST /ai/train dispara el entrenamiento del modelo', async () => {
    anomalyMock.entrenar.mockResolvedValueOnce({ entrenado: true, nVotos: 10 });
    const res = await request(server).post('/ai/train');
    expect(res.status).toBe(201);
    expect(anomalyMock.entrenar).toHaveBeenCalled();
    expect((res.body as { entrenado: boolean }).entrenado).toBe(true);
  });

  it('GET /ai/anomalies reenvía el electionId al servicio', async () => {
    anomalyMock.detectar.mockResolvedValueOnce({
      total: 0,
      anomalas: 0,
      resultados: [],
    });
    const res = await request(server)
      .get('/ai/anomalies')
      .query({ electionId: 'eleccion-1' });
    expect(res.status).toBe(200);
    expect(anomalyMock.detectar).toHaveBeenCalledWith('eleccion-1');
  });

  it('GET /ai/anomalies funciona también sin electionId', async () => {
    anomalyMock.detectar.mockResolvedValueOnce({
      total: 0,
      anomalas: 0,
      resultados: [],
    });
    const res = await request(server).get('/ai/anomalies');
    expect(res.status).toBe(200);
    expect(anomalyMock.detectar).toHaveBeenCalledWith(undefined);
  });
});
