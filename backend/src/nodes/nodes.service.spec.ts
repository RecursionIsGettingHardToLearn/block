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

  it('startDeploy responde al instante y rechaza un segundo despliegue simultáneo', () => {
    // El despliegue real nunca corre: se simula uno que no termina.
    jest
      .spyOn(service, 'deployPeer')
      .mockReturnValue(new Promise(() => undefined));

    const job = service.startDeploy({ nombre: 'peer9' });
    expect(job.estado).toBe('EN_PROGRESO');
    expect(job.peerName).toBe('peer9');

    expect(() => service.startDeploy({ nombre: 'peer8' })).toThrow(
      ConflictException,
    );
    expect(service.getDeployments()[0].id).toBe(job.id);
  });

  it('el trabajo termina FALLIDO con el error en los logs si el despliegue revienta', async () => {
    jest
      .spyOn(service, 'deployPeer')
      .mockRejectedValue(new Error('docker no responde'));

    const job = service.startDeploy({ nombre: 'peer9' });
    await new Promise((r) => setTimeout(r, 10)); // deja resolver la promesa

    expect(job.estado).toBe('FALLIDO');
    expect(job.error).toBe('docker no responde');
    expect(job.logs.at(-1)).toContain('docker no responde');
  });

  it('des-registrar un peer INACTIVO no consulta la guarda', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [nodeRow(false)] })
      .mockResolvedValueOnce({ rows: [] }); // DELETE directo

    await expect(service.remove('nodo-1')).resolves.toBeUndefined();
    // Solo 2 consultas: el SELECT del nodo y el DELETE (sin COUNT de guarda).
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });
});
