import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { FabricService } from '../fabric/fabric.service';
import { Election, ElectionsService } from './elections.service';

const mockDb = {
  query: jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>(),
};
const mockFabric = { cerrarEleccion: jest.fn() };

const electionRow = {
  id: 'uuid-1',
  id_organizacion: 'org-1',
  titulo: 'Test',
  descripcion: null,
  fecha_inicio: new Date('2025-01-01'),
  fecha_fin: new Date('2025-01-02'),
  estado: 'ACTIVA',
  canal_fabric: 'evoting',
  creado_en: new Date(),
};

describe('ElectionsService', () => {
  let service: ElectionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectionsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: FabricService, useValue: mockFabric },
      ],
    }).compile();

    service = module.get<ElectionsService>(ElectionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── closeExpiredElections ────────────────────────────────────────────────

  describe('closeExpiredElections', () => {
    it('retorna 0 cuando no hay elecciones vencidas', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const count = await service.closeExpiredElections();
      expect(count).toBe(0);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('cierra cada elección vencida y retorna el conteo', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'uuid-1' }, { id: 'uuid-2' }],
      });
      const spy = jest
        .spyOn(service, 'updateStatus')
        .mockResolvedValue({} as Election);

      const count = await service.closeExpiredElections();

      expect(count).toBe(2);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('uuid-1', { status: 'CERRADA' });
      expect(spy).toHaveBeenCalledWith('uuid-2', { status: 'CERRADA' });
    });

    it('continúa con las siguientes si una falla', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'uuid-1' }, { id: 'uuid-2' }],
      });
      const spy = jest
        .spyOn(service, 'updateStatus')
        .mockRejectedValueOnce(new Error('Fabric offline'))
        .mockResolvedValueOnce({} as Election);

      const count = await service.closeExpiredElections();

      expect(count).toBe(2);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('solo busca elecciones en estado ACTIVA', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.closeExpiredElections();
      const [sql] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/estado\s*=\s*'ACTIVA'/);
      expect(sql).toMatch(/fecha_fin\s*<\s*NOW\(\)/);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('rechaza transición inválida PROGRAMADA → CERRADA', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...electionRow, estado: 'PROGRAMADA' }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // candidatos

      await expect(
        service.updateStatus('uuid-1', { status: 'CERRADA' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta transición válida ACTIVA → CERRADA', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [electionRow] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // candidatos findById
        .mockResolvedValueOnce({
          rows: [{ ...electionRow, estado: 'CERRADA' }],
        }) // update
        .mockResolvedValueOnce({ rows: [] }); // candidatos post-update
      mockFabric.cerrarEleccion.mockResolvedValue(undefined);

      const result = await service.updateStatus('uuid-1', {
        status: 'CERRADA',
      });
      expect(result.status).toBe('CERRADA');
    });

    it('llama a cerrarEleccion en Fabric al pasar a CERRADA', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [electionRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...electionRow, estado: 'CERRADA' }],
        })
        .mockResolvedValueOnce({ rows: [] });
      mockFabric.cerrarEleccion.mockResolvedValue(undefined);

      await service.updateStatus('uuid-1', { status: 'CERRADA' });
      expect(mockFabric.cerrarEleccion).toHaveBeenCalledWith('uuid-1');
    });

    it('no bloquea la transición si Fabric falla al cerrar', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [electionRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...electionRow, estado: 'CERRADA' }],
        })
        .mockResolvedValueOnce({ rows: [] });
      mockFabric.cerrarEleccion.mockRejectedValue(new Error('Fabric offline'));

      await expect(
        service.updateStatus('uuid-1', { status: 'CERRADA' }),
      ).resolves.not.toThrow();
    });
  });
});
