import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { NodesService } from './nodes.service';

const mockDb = {
  query: jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>(),
};

/** Fila de nodos_fabric como la devuelve Postgres. */
const nodeRow = (activo: boolean) => ({
  id: 'nodo-1',
  nombre: 'peer-prueba',
  endpoint: 'localhost:9999',
  // Alias improbable: garantiza que ningún contenedor real responda en CI.
  host_alias: 'peer-prueba-inexistente.local',
  activo,
  prioridad: 0,
  creado_en: new Date(),
});

describe('NodesService — guarda del último peer activo', () => {
  let service: NodesService;

  beforeEach(async () => {
    mockDb.query.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NodesService, { provide: DatabaseService, useValue: mockDb }],
    }).compile();
    service = module.get(NodesService);
  });

  it('rechaza apagar el último peer activo con una elección en curso', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [nodeRow(true)] }) // el nodo
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // no quedan otros
      .mockResolvedValueOnce({ rows: [{ titulo: 'Rectorado 2026' }] }); // ACTIVA

    const promesa = service.toggle('nodo-1');
    await expect(promesa).rejects.toThrow(ConflictException);
    await expect(promesa).rejects.toThrow(/Rectorado 2026/);

    // Ningún UPDATE debe haberse ejecutado: el estado no cambió.
    const updates = mockDb.query.mock.calls.filter(([sql]) =>
      sql.includes('UPDATE'),
    );
    expect(updates).toHaveLength(0);
  });

  it('permite apagar el último peer si NO hay elecciones activas', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [nodeRow(true)] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] }); // sin elecciones ACTIVA

    // La guarda deja pasar; los comandos docker fallan (el contenedor no
    // existe) y, por el toggle honesto, el estado en la base NO cambia.
    const result = await service.toggle('nodo-1');
    expect(result.node.activo).toBe(true);
    expect(result.logs).toContain('El peer no respondió');
  }, 20_000);

  it('rechaza des-registrar el último peer activo con una elección en curso', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [nodeRow(true)] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ titulo: 'Decano FICCT' }] });

    await expect(service.remove('nodo-1')).rejects.toThrow(ConflictException);

    const deletes = mockDb.query.mock.calls.filter(([sql]) =>
      sql.includes('DELETE'),
    );
    expect(deletes).toHaveLength(0);
  });

  it('permite des-registrar si quedan otros peers activos, incluso en elección', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [nodeRow(true)] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // queda otro
      .mockResolvedValueOnce({ rows: [] }); // DELETE

    await expect(service.remove('nodo-1')).resolves.toBeUndefined();
    const deletes = mockDb.query.mock.calls.filter(([sql]) =>
      sql.includes('DELETE FROM nodos_fabric'),
    );
    expect(deletes).toHaveLength(1);
  }, 20_000);

  it('des-registrar un peer INACTIVO no consulta la guarda', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [nodeRow(false)] })
      .mockResolvedValueOnce({ rows: [] }); // DELETE directo

    await expect(service.remove('nodo-1')).resolves.toBeUndefined();
    // Solo 2 consultas: el SELECT del nodo y el DELETE (sin COUNT de guarda).
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });
});
