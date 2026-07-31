import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { AnomalyService } from '../../../src/ai/anomaly.service';

jest.mock('axios');
const axiosMock = axios as jest.Mocked<typeof axios>;

/**
 * Pruebas UNITARIAS del cliente del microservicio de IA. Se simula axios para
 * no depender del microservicio Python real.
 */
describe('AnomalyService (unitario)', () => {
  let service: AnomalyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const config = { get: jest.fn((_k: string, def: string) => def) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AnomalyService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = moduleRef.get<AnomalyService>(AnomalyService);
  });

  it('se instancia correctamente', () => {
    expect(service).toBeDefined();
  });

  it('estado() consulta /estado y devuelve los metadatos', async () => {
    axiosMock.get.mockResolvedValueOnce({
      data: { entrenado: true, nVotos: 42 },
    });
    const res = await service.estado();
    expect(res.entrenado).toBe(true);
    expect(res.nVotos).toBe(42);
    expect(axiosMock.get.mock.calls[0][0]).toContain('/estado');
  });

  it('detectar() pasa el electionId como parámetro eleccion', async () => {
    axiosMock.get.mockResolvedValueOnce({
      data: { total: 3, anomalas: 0, resultados: [] },
    });
    const res = await service.detectar('eleccion-xyz');
    expect(res.total).toBe(3);
    const opciones = axiosMock.get.mock.calls[0][1];
    expect(opciones?.params).toEqual({ eleccion: 'eleccion-xyz' });
  });

  it('entrenar() hace POST a /entrenar', async () => {
    axiosMock.post.mockResolvedValueOnce({ data: { entrenado: true } });
    const res = await service.entrenar();
    expect(res.entrenado).toBe(true);
    expect(axiosMock.post.mock.calls[0][0]).toContain('/entrenar');
  });

  it('mapea un 503 del microservicio a ServiceUnavailableException', async () => {
    axiosMock.get.mockRejectedValueOnce({
      response: { status: 503, data: { detail: 'Modelo no entrenado.' } },
      message: 'Request failed',
    });
    await expect(service.estado()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('mapea un 409 (sin datos) a ConflictException', async () => {
    axiosMock.post.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'No hay votos.' } },
      message: 'Request failed',
    });
    await expect(service.entrenar()).rejects.toBeInstanceOf(ConflictException);
  });

  it('si el microservicio no responde, lanza ServiceUnavailableException', async () => {
    axiosMock.get.mockRejectedValueOnce({ message: 'ECONNREFUSED' });
    await expect(service.detectar()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
