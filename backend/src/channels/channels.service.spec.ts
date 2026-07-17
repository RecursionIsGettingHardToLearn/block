import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { ChannelsService } from './channels.service';

const mockDb = {
  query: jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>(),
};

describe('ChannelsService — creación de canal en segundo plano', () => {
  let service: ChannelsService;

  beforeEach(async () => {
    mockDb.query.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ChannelsService);
  });

  it('startCreate responde al instante y rechaza una segunda creación simultánea', () => {
    // La creación real nunca corre: se simula una que no termina.
    jest
      .spyOn(service, 'createChannel')
      .mockReturnValue(new Promise(() => undefined));

    const job = service.startCreate({ nombre: 'canal-x' });
    expect(job.estado).toBe('EN_PROGRESO');
    expect(job.channelName).toBe('canal-x');

    expect(() => service.startCreate({ nombre: 'canal-y' })).toThrow(
      ConflictException,
    );
    expect(service.getCreations()[0].id).toBe(job.id);
  });

  it('el trabajo termina FALLIDO con el error en los logs si la creación revienta', async () => {
    jest
      .spyOn(service, 'createChannel')
      .mockRejectedValue(new Error('el orderer no responde'));

    const job = service.startCreate({ nombre: 'canal-x' });
    await new Promise((r) => setTimeout(r, 10));

    expect(job.estado).toBe('FALLIDO');
    expect(job.error).toBe('el orderer no responde');
    expect(job.logs.at(-1)).toContain('el orderer no responde');
  });

  it('startDeployChaincode corre en segundo plano y comparte el candado con crear', () => {
    jest
      .spyOn(service, 'deployChaincode')
      .mockReturnValue(new Promise(() => undefined));

    const job = service.startDeployChaincode('canal-x');
    expect(job.tipo).toBe('DESPLEGAR_CHAINCODE');
    expect(job.estado).toBe('EN_PROGRESO');

    // Una operación de canal a la vez: crear se rechaza mientras el chaincode
    // se despliega, porque ambas usan el contenedor cli.
    expect(() => service.startCreate({ nombre: 'canal-y' })).toThrow(
      ConflictException,
    );
  });
});
