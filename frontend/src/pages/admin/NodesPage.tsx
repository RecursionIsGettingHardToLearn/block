import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  PlusCircle,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  Rocket,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '../../api/axios.config';
import { getApiErrorMessage } from '../../api/errors';

interface FabricNode {
  id: string;
  nombre: string;
  endpoint: string;
  hostAlias: string;
  activo: boolean;
  /** Estado real del contenedor según Docker (lo reporta el backend). */
  enEjecucion?: boolean;
  prioridad: number;
  creadoEn: string;
}

const emptyAddForm = { nombre: '', endpoint: '', hostAlias: '' };
const emptyDeplForm = { nombre: '' };

export default function NodesPage() {
  const [nodes, setNodes] = useState<FabricNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [deplForm, setDeplForm] = useState(emptyDeplForm);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployLogs, setDeployLogs] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionLogs, setActionLogs] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [showActionLogs, setShowActionLogs] = useState(false);
  const [loadingPort, setLoadingPort] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<FabricNode[]>('/nodes');
      setNodes(data);
    } catch {
      setError('Error cargando nodos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openAddForm() {
    setShowDeploy(false);
    setError(null);
    const opening = !showAdd;
    setShowAdd((v) => !v);
    if (!opening) return;
    setLoadingPort(true);
    try {
      const { data } = await api.get<{
        port: number;
        endpoint: string;
        hostAlias: string;
        nombre: string;
      }>('/nodes/free-port');
      setAddForm({
        nombre: data.nombre,
        endpoint: data.endpoint,
        hostAlias: data.hostAlias,
      });
    } catch {
      setAddForm(emptyAddForm);
    } finally {
      setLoadingPort(false);
    }
  }

  async function handleAdd() {
    if (!addForm.nombre || !addForm.endpoint || !addForm.hostAlias) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/nodes', { ...addForm, activo: true });
      setAddForm(emptyAddForm);
      setShowAdd(false);
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al agregar nodo'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeploy() {
    if (!deplForm.nombre) return;
    setDeploying(true);
    setError(null);
    setDeployLogs(null);
    try {
      const { data } = await api.post<{ node: FabricNode; logs: string }>(
        '/nodes/deploy',
        { nombre: deplForm.nombre },
      );
      setDeployLogs(data.logs);
      setShowLogs(true);
      setDeplForm(emptyDeplForm);
      setShowDeploy(false);
      await load();
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e, 'Error en deploy');
      setError(msg);
      setDeployLogs(msg);
      setShowLogs(true);
    } finally {
      setDeploying(false);
    }
  }

  async function handleToggle(node: FabricNode) {
    // Apagar el último peer encendido deja la red sin votación posible:
    // se pide confirmación. Si además hay una elección en curso, el backend
    // rechaza la operación aunque se confirme (la regla dura vive allá).
    const quedanOtros = nodes.some((n) => n.id !== node.id && n.activo);
    if (node.activo && !quedanOtros) {
      const seguir = window.confirm(
        'Este es el último peer encendido: al apagarlo, Fabric quedará ' +
          'desconectado y no se podrán emitir votos hasta encender un peer ' +
          'de nuevo. ¿Continuar?',
      );
      if (!seguir) return;
    }
    setTogglingId(node.id);
    setError(null);
    try {
      const { data } = await api.patch<{ node: FabricNode; logs: string }>(
        `/nodes/${node.id}/toggle`,
      );
      const action = node.activo ? 'Apagado' : 'Encendido';
      setActionLogs({ title: `${action}: ${node.nombre}`, text: data.logs });
      setShowActionLogs(true);
      await load();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Error al cambiar estado del nodo'));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este nodo?')) return;
    try {
      await api.delete(`/nodes/${id}`);
      await load();
    } catch {
      setError('Error al eliminar nodo');
    }
  }

  const activeNodes = nodes.filter((node) => node.enEjecucion ?? node.activo);

  return (
    <div className="flex flex-col gap-6 animate-slide-up max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            Nodos Fabric
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            Gestiona los peers de Hyperledger Fabric conectados al sistema
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openAddForm}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-0 cursor-pointer transition-opacity hover:opacity-90"
            style={{
              background: 'var(--status-sched-bg, #e0f2fe)',
              color: 'var(--status-sched, #0284c7)',
            }}
            title="Solo registra la dirección de un peer que ya existe (p. ej., en otra máquina)"
          >
            <PlusCircle size={15} />
            Registrar Existente
          </button>
          <button
            onClick={() => {
              setShowDeploy((v) => !v);
              setShowAdd(false);
              setError(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand)' }}
            title="Crea un peer completo: certificados, contenedores, canal y chaincode"
          >
            <Rocket size={15} />
            Crear Peer
          </button>
        </div>
      </div>

      {!loading && nodes.length > 0 && activeNodes.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black uppercase tracking-tight">
              Fabric sin nodos activos
            </p>
            <p className="text-xs mt-1">
              El backend corta la conexión con la red Fabric. Las operaciones
              electorales usarán contingencia local hasta activar un nodo.
            </p>
          </div>
        </div>
      )}

      {/* ── Formulario: Agregar nodo existente ── */}
      {showAdd && (
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3
                className="font-semibold text-sm"
                style={{ color: 'var(--text-1)' }}
              >
                Registrar peer existente
              </h3>
              {loadingPort && (
                <Loader2
                  size={13}
                  className="animate-spin"
                  style={{ color: 'var(--text-3)' }}
                />
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Solo anota la dirección de un peer que <strong>ya existe</strong>{' '}
              (por ejemplo, en otra máquina): no crea nada en Docker. Los peers
              locales en ejecución se registran solos al refrescar la página;
              para crear uno nuevo desde cero, usa <strong>Crear Peer</strong>.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                { label: 'Nombre', key: 'nombre', ph: 'peer2' },
                { label: 'Endpoint', key: 'endpoint', ph: 'localhost:9051' },
                {
                  label: 'Host Alias',
                  key: 'hostAlias',
                  ph: 'peer2.ficct.edu.bo',
                },
              ] as const
            ).map(({ label, key, ph }) => (
              <div key={key} className="flex flex-col gap-1">
                <label
                  className="text-xs font-semibold"
                  style={{ color: 'var(--text-2)' }}
                >
                  {label}
                </label>
                <input
                  value={addForm[key]}
                  onChange={(e) =>
                    setAddForm({ ...addForm, [key]: e.target.value })
                  }
                  placeholder={ph}
                  disabled={loadingPort}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    opacity: loadingPort ? 0.6 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          {error && <ErrorBanner msg={error} />}
          <FormActions
            onCancel={() => {
              setShowAdd(false);
              setAddForm(emptyAddForm);
              setError(null);
              setLoadingPort(false);
            }}
            onSubmit={handleAdd}
            submitting={saving}
            disabled={
              saving ||
              !addForm.nombre ||
              !addForm.endpoint ||
              !addForm.hostAlias
            }
            label="Agregar"
          />
        </div>
      )}

      {/* ── Formulario: Desplegar nuevo peer ── */}
      {showDeploy && (
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
              Crear nuevo peer
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              Crea un peer completo desde cero: certificados con la CA,
              contenedores (peer + CouchDB), unión al canal, chaincode y{' '}
              <strong>registro automático</strong>. No hace falta registrarlo
              después.
            </p>
          </div>
          <div className="flex flex-col gap-1 max-w-xs">
            <label
              className="text-xs font-semibold"
              style={{ color: 'var(--text-2)' }}
            >
              Nombre del peer
            </label>
            <input
              value={deplForm.nombre}
              onChange={(e) => setDeplForm({ nombre: e.target.value })}
              placeholder="peer2"
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
            />
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Los puertos se asignan automáticamente.
            </p>
          </div>

          {error && <ErrorBanner msg={error} />}

          {deploying && (
            <div
              className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              <Loader2 size={13} className="animate-spin shrink-0" />
              Desplegando… esto puede tardar hasta 2 minutos. No cierres esta
              ventana.
            </div>
          )}

          <FormActions
            onCancel={() => {
              setShowDeploy(false);
              setDeplForm(emptyDeplForm);
              setError(null);
            }}
            onSubmit={handleDeploy}
            submitting={deploying}
            disabled={deploying || !deplForm.nombre}
            label="Desplegar"
            icon={<Rocket size={13} />}
          />
        </div>
      )}

      {/* ── Logs de deploy ── */}
      {deployLogs !== null && (
        <LogsPanel
          title="Logs del deploy"
          logs={deployLogs}
          show={showLogs}
          onToggle={() => setShowLogs((v) => !v)}
        />
      )}

      {/* ── Logs de encendido/apagado ── */}
      {actionLogs !== null && (
        <LogsPanel
          title={actionLogs.title}
          logs={actionLogs.text}
          show={showActionLogs}
          onToggle={() => setShowActionLogs((v) => !v)}
        />
      )}

      {/* ── Tabla de nodos ── */}
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
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Server size={32} style={{ color: 'var(--text-3)' }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              No hay nodos registrados
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
                {['Estado', 'Nombre', 'Endpoint', 'Host Alias', 'Acciones'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, i) => (
                <tr
                  key={node.id}
                  style={{
                    background:
                      i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {(node.enEjecucion ?? node.activo) ? (
                        <Wifi
                          size={14}
                          style={{ color: 'var(--status-active)' }}
                        />
                      ) : (
                        <WifiOff size={14} style={{ color: 'var(--text-3)' }} />
                      )}
                      <span
                        className="text-xs font-semibold"
                        style={{
                          color:
                            (node.enEjecucion ?? node.activo)
                              ? 'var(--status-active)'
                              : 'var(--text-3)',
                        }}
                      >
                        {(node.enEjecucion ?? node.activo)
                          ? 'Activo'
                          : 'Detenido'}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 font-medium"
                    style={{ color: 'var(--text-1)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Server size={14} style={{ color: 'var(--text-3)' }} />
                      {node.nombre}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        background: 'var(--surface-2)',
                        color: 'var(--brand)',
                      }}
                    >
                      {node.endpoint}
                    </code>
                  </td>
                  <td
                    className="px-4 py-3 text-xs"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {node.hostAlias}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(node)}
                        disabled={togglingId === node.id}
                        title={node.activo ? 'Apagar' : 'Encender'}
                        className="p-1.5 rounded-lg cursor-pointer border-0 transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{
                          background: node.activo
                            ? 'var(--status-active-bg)'
                            : 'var(--surface-2)',
                          color: node.activo
                            ? 'var(--status-active)'
                            : 'var(--text-3)',
                        }}
                      >
                        {togglingId === node.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : node.activo ? (
                          <ToggleRight size={15} />
                        ) : (
                          <ToggleLeft size={15} />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(node.id)}
                        title="Eliminar"
                        className="p-1.5 rounded-lg cursor-pointer border-0 transition-opacity hover:opacity-80"
                        style={{
                          background: 'var(--error-bg)',
                          color: 'var(--error)',
                        }}
                      >
                        <Trash2 size={15} />
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
        Al activar un nodo, el backend se reconecta al peer activo de mayor
        prioridad. Si todos están inactivos, Fabric queda desconectado.
      </p>
    </div>
  );
}

/* ── Helpers ── */

function LogsPanel({
  title,
  logs,
  show,
  onToggle,
}: {
  title: string;
  logs: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold cursor-pointer border-0"
        style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
      >
        <span>{title}</span>
        {show ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {show && (
        <pre
          className="p-4 text-xs overflow-x-auto whitespace-pre-wrap"
          style={{
            background: '#0f172a',
            color: '#94a3b8',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {logs}
        </pre>
      )}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
    >
      <AlertCircle size={13} className="shrink-0" />
      <span className="break-all">{msg}</span>
    </div>
  );
}

function FormActions({
  onCancel,
  onSubmit,
  submitting,
  disabled,
  label,
  icon,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  disabled: boolean;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 justify-end">
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer border"
        style={{
          background: 'var(--surface-2)',
          color: 'var(--text-2)',
          borderColor: 'var(--border)',
        }}
      >
        Cancelar
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--brand)' }}
      >
        {submitting ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          (icon ?? <PlusCircle size={13} />)
        )}
        {label}
      </button>
    </div>
  );
}
