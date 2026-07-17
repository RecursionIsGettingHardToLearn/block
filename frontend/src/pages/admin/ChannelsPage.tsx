import { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  PlusCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Server,
  Rocket,
} from 'lucide-react';
import api from '../../api/axios.config';
import { getApiErrorMessage } from '../../api/errors';

interface FabricChannel {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  creadoEn: string;
  /** Peers unidos al canal según Fabric (lo reporta el backend). */
  peers?: { id: string; nombre: string }[];
  /** true si el chaincode ya está comprometido en el canal. */
  chaincodeListo?: boolean;
}

interface FabricNode {
  id: string;
  nombre: string;
  endpoint: string;
  hostAlias: string;
  activo: boolean;
  cryptoReady?: boolean;
}

const emptyForm = { nombre: '', descripcion: '' };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<FabricChannel[]>([]);
  const [nodes, setNodes] = useState<FabricNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [joinAll, setJoinAll] = useState(true);

  // Trabajo de creación en curso: vive en el servidor y se rehidrata al
  // entrar, así que navegar a otra página no pierde el progreso.
  interface ChannelJob {
    id: string;
    channelName: string;
    estado: 'EN_PROGRESO' | 'COMPLETADO' | 'FALLIDO';
    logs: string[];
    error?: string;
  }
  const [createJob, setCreateJob] = useState<ChannelJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsTitle, setLogsTitle] = useState('Logs');
  const [showLogs, setShowLogs] = useState(false);
  const [selectedNodeByChannel, setSelectedNodeByChannel] = useState<
    Record<string, string>
  >({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: channelData }, { data: nodeData }] = await Promise.all([
        api.get<FabricChannel[]>('/channels'),
        api.get<FabricNode[]>('/nodes'),
      ]);
      setChannels(channelData);
      setNodes(nodeData);
    } catch {
      setError('Error cargando canales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Retomar cualquier creación que siga viva al entrar a la página.
  useEffect(() => {
    api
      .get<ChannelJob[]>('/channels/creations')
      .then(({ data }) => {
        const vivo =
          data.find((j) => j.estado === 'EN_PROGRESO') ?? data[0] ?? null;
        if (vivo) setCreateJob(vivo);
      })
      .catch(() => undefined);
  }, []);

  // Mientras la creación esté en progreso, consultar su avance cada 2 s.
  useEffect(() => {
    if (createJob?.estado !== 'EN_PROGRESO') return;
    const t = setInterval(() => {
      api
        .get<ChannelJob[]>('/channels/creations')
        .then(({ data }) => {
          const actualizado = data.find((j) => j.id === createJob.id);
          if (!actualizado) return;
          setCreateJob(actualizado);
          if (actualizado.estado !== 'EN_PROGRESO') {
            void load(); // terminó: refrescar la tabla de canales
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [createJob, load]);

  async function handleCreate() {
    if (!form.nombre) return;
    setCreating(true);
    setError(null);
    try {
      // El backend responde al instante con el trabajo; la creación sigue en
      // segundo plano y el polling la va actualizando.
      const { data } = await api.post<ChannelJob>('/channels', {
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        unirPeers: joinAll,
      });
      setCreateJob(data);
      setForm(emptyForm);
      setJoinAll(true);
      setShowForm(false);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al iniciar la creación'));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinPeer(channelName: string) {
    const nodeId = selectedNodeByChannel[channelName];
    if (!nodeId) {
      setError('Selecciona un peer activo para unirlo al canal');
      return;
    }

    setBusyAction(`join:${channelName}`);
    setError(null);
    try {
      const { data } = await api.post<{ logs: string }>(
        `/channels/${channelName}/peers/${nodeId}`,
      );
      setLogsTitle(`Unir peer: ${channelName}`);
      setLogs(data.logs);
      setShowLogs(true);
      await load();
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e, 'Error al unir peer al canal');
      setError(msg);
      setLogsTitle(`Error uniendo peer: ${channelName}`);
      setLogs(msg);
      setShowLogs(true);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeployChaincode(channelName: string) {
    setBusyAction(`cc:${channelName}`);
    setError(null);
    try {
      const { data } = await api.post<{ logs: string }>(
        `/channels/${channelName}/chaincode`,
      );
      setLogsTitle(`Chaincode: ${channelName}`);
      setLogs(data.logs);
      setShowLogs(true);
      await load();
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e, 'Error al desplegar chaincode');
      setError(msg);
      setLogsTitle(`Error chaincode: ${channelName}`);
      setLogs(msg);
      setShowLogs(true);
    } finally {
      setBusyAction(null);
    }
  }

  const activeNodes = nodes.filter(
    (node) => node.activo && node.cryptoReady !== false,
  );
  const invalidActiveNodes = nodes.filter(
    (node) => node.activo && node.cryptoReady === false,
  );

  return (
    <div className="flex flex-col gap-6 animate-slide-up max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            Canales Fabric
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            Cada canal es un ledger independiente — las elecciones se asignan a
            un canal al crearse
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setError(null);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: 'var(--brand)' }}
        >
          <PlusCircle size={15} />
          Crear Canal
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div>
            <h3
              className="font-semibold text-sm"
              style={{ color: 'var(--text-1)' }}
            >
              Nuevo canal
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              Genera el bloque génesis del canal en el orderer. Puedes unir
              todos los peers y desplegar el chaincode ahora, o hacerlo
              manualmente después.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Nombre del canal
              </label>
              <input
                value={form.nombre}
                onChange={(e) =>
                  setForm({
                    ...form,
                    nombre: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, ''),
                  })
                }
                placeholder="evoting-ficct"
                className="rounded-lg px-3 py-2 text-sm font-mono"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                }}
              />
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Minúsculas, letras/números/guiones, 3–49 chars
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Descripción (opcional)
              </label>
              <input
                value={form.descripcion}
                onChange={(e) =>
                  setForm({ ...form, descripcion: e.target.value })
                }
                placeholder="Canal de elecciones FICCT 2026"
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                }}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none mt-3">
            <input
              type="checkbox"
              checked={joinAll}
              onChange={(e) => setJoinAll(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
              <strong>
                Unir todos los peers activos y desplegar el chaincode
              </strong>{' '}
              (~1 min). Si lo desmarcas, solo se crea el canal: después unes los
              nodos uno a uno con «Unir» y despliegas el chaincode cuando haya
              al menos uno unido.
            </span>
          </label>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span className="break-all">{error}</span>
            </div>
          )}

          {invalidActiveNodes.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                background: 'var(--warning-bg)',
                color: 'var(--warning)',
              }}
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>
                {invalidActiveNodes.length} peer(s) activos no tienen
                certificados TLS y serán omitidos:{' '}
                {invalidActiveNodes.map((node) => node.nombre).join(', ')}.
              </span>
            </div>
          )}

          {creating && (
            <div
              className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              <Loader2 size={13} className="animate-spin shrink-0" />
              Creando canal… puede tardar ~1 minuto.
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
                setError(null);
              }}
              disabled={creating}
              title={
                creating
                  ? 'La creación ya está en marcha en la red y no puede cancelarse: un canal creado en Fabric no se deshace'
                  : undefined
              }
              className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-2)',
                borderColor: 'var(--border)',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || form.nombre.length < 3}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {creating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <PlusCircle size={13} />
              )}
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Logs */}
      {logs !== null && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold cursor-pointer border-0"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
          >
            <span>{logsTitle}</span>
            {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showLogs && (
            <pre
              className="p-4 text-xs overflow-x-auto whitespace-pre-wrap"
              style={{
                background: '#0f172a',
                color: '#94a3b8',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {logs}
            </pre>
          )}
        </div>
      )}

      {/* ── Progreso de la creación en segundo plano ── */}
      {createJob && (
        <div
          className="mb-4 rounded-2xl p-4"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {createJob.estado === 'EN_PROGRESO' && (
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: 'var(--brand)' }}
                />
              )}
              <span className="text-sm font-semibold">
                {createJob.estado === 'EN_PROGRESO' &&
                  `Creando el canal ${createJob.channelName}… (puedes navegar a otra página)`}
                {createJob.estado === 'COMPLETADO' &&
                  `✅ Canal ${createJob.channelName} creado correctamente`}
                {createJob.estado === 'FALLIDO' &&
                  `❌ Falló la creación del canal ${createJob.channelName}`}
              </span>
            </div>
            {createJob.estado !== 'EN_PROGRESO' && (
              <button
                onClick={() => setCreateJob(null)}
                className="text-xs cursor-pointer border-0 bg-transparent"
                style={{ color: 'var(--text-3)' }}
              >
                Cerrar
              </button>
            )}
          </div>
          <pre
            className="text-[11px] p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap"
            style={{ background: 'var(--surface-1)', color: 'var(--text-2)' }}
          >
            {createJob.logs.length ? createJob.logs.join('\n') : 'Iniciando…'}
          </pre>
        </div>
      )}

      {/* Lista de canales */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
        }}
      >
        {loading ? (
          <div
            className="flex items-center justify-center h-32"
            style={{ color: 'var(--text-3)' }}
          >
            <div className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Layers size={32} style={{ color: 'var(--text-3)' }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              No hay canales registrados
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {[
                  'Estado',
                  'Canal',
                  'Descripción',
                  'Creado',
                  'Operaciones',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, i) => (
                <tr
                  key={ch.id}
                  style={{
                    background:
                      i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {ch.activo ? (
                        <CheckCircle2
                          size={14}
                          style={{ color: 'var(--status-active)' }}
                        />
                      ) : (
                        <Circle size={14} style={{ color: 'var(--text-3)' }} />
                      )}
                      <span
                        className="text-xs font-semibold"
                        style={{
                          color: ch.activo
                            ? 'var(--status-active)'
                            : 'var(--text-3)',
                        }}
                      >
                        {ch.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Layers size={14} style={{ color: 'var(--text-3)' }} />
                      <code
                        className="text-xs px-2 py-1 rounded font-semibold"
                        style={{
                          background: 'var(--surface-2)',
                          color: 'var(--brand)',
                        }}
                      >
                        {ch.nombre}
                      </code>
                    </div>
                    <div
                      className="mt-1 text-[11px]"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {ch.peers && ch.peers.length > 0
                        ? `Nodos unidos: ${ch.peers.map((p) => p.nombre).join(', ')}`
                        : 'Ningún peer activo unido'}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {ch.descripcion ?? (
                      <span style={{ color: 'var(--text-3)' }}>—</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {new Date(ch.creadoEn).toLocaleDateString('es-BO')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2 min-w-[240px]">
                      <div className="flex gap-2">
                        <select
                          value={selectedNodeByChannel[ch.nombre] ?? ''}
                          onChange={(e) =>
                            setSelectedNodeByChannel({
                              ...selectedNodeByChannel,
                              [ch.nombre]: e.target.value,
                            })
                          }
                          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-xs"
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-1)',
                          }}
                        >
                          <option value="">
                            {activeNodes.some(
                              (n) => !ch.peers?.some((p) => p.id === n.id),
                            )
                              ? 'Peer activo…'
                              : 'Todos ya están unidos'}
                          </option>
                          {activeNodes
                            .filter(
                              (node) =>
                                !ch.peers?.some((p) => p.id === node.id),
                            )
                            .map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.nombre} ({node.endpoint})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleJoinPeer(ch.nombre)}
                          disabled={
                            busyAction === `join:${ch.nombre}` ||
                            !activeNodes.some(
                              (n) => !ch.peers?.some((p) => p.id === n.id),
                            )
                          }
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold border-0 cursor-pointer disabled:opacity-50"
                          style={{
                            background: 'var(--surface-2)',
                            color: 'var(--text-2)',
                          }}
                          title="Unir peer seleccionado al canal"
                        >
                          {busyAction === `join:${ch.nombre}` ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Server size={12} />
                          )}
                          Unir
                        </button>
                      </div>
                      <button
                        onClick={() => handleDeployChaincode(ch.nombre)}
                        disabled={
                          busyAction === `cc:${ch.nombre}` ||
                          ch.chaincodeListo === true ||
                          !ch.peers?.length
                        }
                        className="flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white border-0 cursor-pointer disabled:opacity-50"
                        style={{ background: 'var(--brand)' }}
                        title={
                          ch.chaincodeListo
                            ? 'El chaincode ya está desplegado en este canal'
                            : !ch.peers?.length
                              ? 'Une al menos un peer antes de desplegar el chaincode'
                              : 'Instalar, aprobar y confirmar chaincode en este canal'
                        }
                      >
                        {busyAction === `cc:${ch.nombre}` ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : ch.chaincodeListo ? (
                          <CheckCircle2 size={12} />
                        ) : (
                          <Rocket size={12} />
                        )}
                        {ch.chaincodeListo
                          ? 'Chaincode listo'
                          : 'Desplegar chaincode'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Flujo correcto: crear canal, unir peers activos, desplegar chaincode y
        recién usar ese canal en una elección.
      </p>
    </div>
  );
}
