import { Test, TestingModule } from '@nestjs/testing';
import { ElectionsScheduler } from './elections.scheduler';
import { ElectionsService } from './elections.service';

const mockElectionsService = {
  closeExpiredElections: jest.fn(),
};

describe('ElectionsScheduler', () => {
  let scheduler: ElectionsScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectionsScheduler,
        { provide: ElectionsService, useValue: mockElectionsService },
      ],
    }).compile();

    scheduler = module.get<ElectionsScheduler>(ElectionsScheduler);
  });

  afterEach(() => jest.clearAllMocks());

  it('llama a closeExpiredElections cada vez que se dispara', async () => {
    mockElectionsService.closeExpiredElections.mockResolvedValue(3);
    await scheduler.closeExpiredElections();
    expect(mockElectionsService.closeExpiredElections).toHaveBeenCalledTimes(1);
  });

  it('no lanza si no hay elecciones vencidas', async () => {
    mockElectionsService.closeExpiredElections.mockResolvedValue(0);
    await expect(scheduler.closeExpiredElections()).resolves.not.toThrow();
  });

  it('no lanza si el servicio falla (error aislado)', async () => {
    mockElectionsService.closeExpiredElections.mockRejectedValue(
      new Error('DB caída'),
    );
    await expect(scheduler.closeExpiredElections()).resolves.not.toThrow();
  });
});
