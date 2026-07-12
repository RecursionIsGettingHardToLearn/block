import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowRight,
  UserPlus,
  X,
  AlertCircle,
  Search,
  Clock,
  Network,
  Server,
  Radio,
} from 'lucide-react';
import { useElections } from '../../hooks/useElections';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmModal from '../../components/common/ConfirmModal';
import api from '../../api/axios.config';
import type { Election, ElectionStatus, Candidate, User } from '../../types';

interface FabricChannel {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface FabricNode {
  id: string;
  nombre: string;
  endpoint: string;
  hostAlias: string;
  activo: boolean;
  prioridad: number;
}

const NEXT_STATUS: Partial<Record<ElectionStatus, ElectionStatus>> = {
  PROGRAMADA: 'ACTIVA',
  ACTIVA: 'CERRADA',
  CERRADA: 'ESCRUTADA',
};

const NEXT_LABEL: Partial<Record<ElectionStatus, string>> = {
  PROGRAMADA: 'Activar',
  ACTIVA: 'Cerrar',
  CERRADA: 'Escrutar',
};

const inputBase: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text-1)',
  outline: 'none',
};

export default function ElectionManager() {
  const {
    elections,
    loading,
    createElection,
    updateStatus,
    deleteElection,
    addCandidate,
    removeCandidate,
    fetchElections,
  } = useElections();

  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<FabricChannel[]>([]);
  const [nodes, setNodes] = useState<FabricNode[]>([]);

  useEffect(() => {
    api
      .get<User[]>('/users')
      .then(({ data }) => setUsers(data))
      .catch(() => {});
    api
      .get<FabricChannel[]>('/channels')
      .then(({ data }) => setChannels(data))
      .catch(() => {});
    api
      .get<FabricNode[]>('/nodes')
      .then(({ data }) => setNodes(data))
      .catch(() => {});
  }, []);

  // Auto-refresh cada 30 s para reflejar cierres automáticos del backend
  useEffect(() => {
    const id = setInterval(fetchElections, 30_000);
    return () => clearInterval(id);
  }, [fetchElections]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    channelName: 'evoting',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState({
    frontName: '',
    candidateName: '',
    position: '' as Candidate['position'],
    mission: '',
    photoUrl: '',
    logoFrente: '',
    logoFile: null as File | null,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Limpiar URL del objeto cuando cambia logoFile y convertir a data URL
  useEffect(() => {
    if (candidateForm.logoFile) {
      // Crear URL para preview
      const objectUrl = URL.createObjectURL(candidateForm.logoFile);
      setPreviewUrl(objectUrl);

      // Convertir a data URL (base64) para enviar al backend
      const reader = new FileReader();
      reader.readAsDataURL(candidateForm.logoFile);
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setLogoDataUrl(dataUrl);
      };

      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    } else {
      setPreviewUrl(null);
      setLogoDataUrl(null);
    }
  }, [candidateForm.logoFile]);
  const [confirm, setConfirm] = useState<{
    message: string;
    action: () => void;
  } | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await createElection({
        title: form.title,
        description: form.description || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        channelName: form.channelName,
      });
      setForm({
        title: '',
        description: '',
        startDate: '',
        endDate: '',
        channelName: 'evoting',
      });
      setShowForm(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setFormError(
        Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al crear'),
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmAction(message: string, action: () => void) {
    setConfirm({ message, action });
  }

  async function handleAddCandidate(electionId: string) {
    console.log('Agregando candidato...', {
      electionId,
      candidateForm,
      previewUrl,
      logoDataUrl,
    });

    // Usar logoDataUrl (base64) si existe, sino logoFrente (URL externa)
    const logoUrl = logoDataUrl || candidateForm.logoFrente || undefined;

    try {
      await addCandidate(electionId, {
        frontName: candidateForm.frontName,
        candidateName: candidateForm.candidateName,
        position: candidateForm.position,
        mission: candidateForm.mission || undefined,
        photoUrl: candidateForm.photoUrl || undefined,
        logoFrente: logoUrl,
      });
      console.log('Candidato agregado exitosamente');
      setCandidateForm({
        frontName: '',
        candidateName: '',
        position: '',
        mission: '',
        photoUrl: '',
        logoFrente: '',
        logoFile: null,
      });
    } catch (error) {
      console.error('Error al agregar candidato:', error);
    }
  }

  if (loading)
    return (
      <div
        className="flex items-center justify-center h-48"
        style={{ color: 'var(--text-3)' }}
      >
        <div className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            Gestión de Elecciones
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            {elections.length} elección{elections.length !== 1 ? 'es' : ''}{' '}
            registrada{elections.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-0 cursor-pointer transition-all"
          style={
            showForm
              ? {
                  background: 'var(--surface-2)',
                  color: 'var(--text-2)',
                  border: '1px solid var(--border)',
                }
              : { background: 'var(--brand)', color: '#fff' }
          }
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancelar' : 'Nueva elección'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl p-6 flex flex-col gap-4 animate-slide-up"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            Nueva elección
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Título *
              </label>
              <input
                className="rounded-lg px-3.5 py-2.5 text-sm w-full"
                style={inputBase}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Descripción
              </label>
              <input
                className="rounded-lg px-3.5 py-2.5 text-sm w-full"
                style={inputBase}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Fecha inicio *
              </label>
              <input
                className="rounded-lg px-3.5 py-2.5 text-sm w-full"
                style={inputBase}
                type="datetime-local"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Fecha fin *
              </label>
              <input
                className="rounded-lg px-3.5 py-2.5 text-sm w-full"
                style={inputBase}
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                Canal Fabric *
              </label>
              <select
                className="rounded-lg px-3.5 py-2.5 text-sm w-full"
                style={inputBase}
                value={form.channelName}
                onChange={(e) =>
                  setForm({ ...form, channelName: e.target.value })
                }
              >
                {channels.length === 0 ? (
                  <option value="evoting">evoting (por defecto)</option>
                ) : (
                  channels.map((ch) => (
                    <option key={ch.nombre} value={ch.nombre}>
                      {ch.nombre}
                      {!ch.activo ? ' (inactivo)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {formError && (
            <div
              className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs"
              style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
            >
              <AlertCircle size={13} className="shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer transition-opacity disabled:opacity-60"
              style={{ background: 'var(--brand)' }}
            >
              {saving ? 'Guardando…' : 'Crear elección'}
            </button>
          </div>
        </form>
      )}

      {/* Election list */}
      <div className="flex flex-col gap-3">
        {elections.length === 0 && !showForm && (
          <div
            className="text-center py-16 text-sm rounded-2xl"
            style={{
              color: 'var(--text-3)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            No hay elecciones. Crea la primera.
          </div>
        )}
        {elections.map((election) => {
          const isExpanded = expandedId === election.id;
          const electionChannel = channels.find(
            (c) => c.nombre === (election.channelName ?? 'evoting'),
          );
          const activeNodes = nodes.filter((n) => n.activo);
          return (
            <div
              key={election.id}
              className="rounded-2xl overflow-hidden transition-shadow"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={election.status} />
                  {/* Canal badge */}
                  <span
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-mono shrink-0 hidden sm:flex"
                    style={{
                      background:
                        electionChannel?.activo === false
                          ? 'var(--error-bg)'
                          : 'var(--surface-2)',
                      color:
                        electionChannel?.activo === false
                          ? 'var(--error)'
                          : 'var(--text-3)',
                      border: '1px solid var(--border)',
                    }}
                    title={`Canal Fabric${electionChannel?.activo === false ? ' (inactivo)' : ''}`}
                  >
                    <Radio size={9} />
                    {election.channelName ?? 'evoting'}
                  </span>
                  {/* Nodos activos */}
                  <span
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0 hidden sm:flex"
                    style={{
                      background:
                        activeNodes.length === 0
                          ? 'var(--error-bg)'
                          : 'var(--surface-2)',
                      color:
                        activeNodes.length === 0
                          ? 'var(--error)'
                          : 'var(--text-3)',
                      border: '1px solid var(--border)',
                    }}
                    title={`${activeNodes.length} nodo(s) activo(s)`}
                  >
                    <Server size={9} />
                    {activeNodes.length} nodo
                    {activeNodes.length !== 1 ? 's' : ''}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="font-semibold text-sm truncate"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {election.title}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {new Date(election.startDate).toLocaleString()} —{' '}
                      {new Date(election.endDate).toLocaleString()}
                    </p>
                    {(election.status === 'ACTIVA' ||
                      election.status === 'PROGRAMADA') && (
                      <TimeRemaining
                        endDate={election.endDate}
                        startDate={election.startDate}
                        status={election.status}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {NEXT_STATUS[election.status] && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-opacity hover:opacity-75"
                      style={{
                        background: 'var(--brand-light)',
                        color: 'var(--brand)',
                      }}
                      onClick={() =>
                        confirmAction(
                          `¿Cambiar estado a ${NEXT_STATUS[election.status]}?`,
                          () =>
                            updateStatus(
                              election.id,
                              NEXT_STATUS[election.status]!,
                            ),
                        )
                      }
                    >
                      <ArrowRight size={11} />
                      {NEXT_LABEL[election.status]}
                    </button>
                  )}
                  {election.status === 'PROGRAMADA' && (
                    <button
                      aria-label="Eliminar elección"
                      className="p-1.5 rounded-lg border-0 cursor-pointer transition-opacity hover:opacity-75"
                      style={{
                        background: 'var(--error-bg)',
                        color: 'var(--error)',
                      }}
                      onClick={() =>
                        confirmAction('¿Eliminar esta elección?', () =>
                          deleteElection(election.id),
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border-0 cursor-pointer transition-colors"
                    style={{
                      background: 'var(--surface-2)',
                      color: 'var(--text-2)',
                    }}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : election.id)
                    }
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <ChevronUp size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                    Candidatos ({(election.candidates ?? []).length})
                  </button>
                </div>
              </div>

              {/* Infra panel */}
              {isExpanded && (
                <InfraPanel
                  channelName={election.channelName ?? 'evoting'}
                  channel={electionChannel ?? null}
                  nodes={nodes}
                />
              )}

              {/* Candidate panel */}
              {isExpanded && (
                <CandidatePanel
                  election={election}
                  users={users}
                  candidateForm={candidateForm}
                  setCandidateForm={setCandidateForm}
                  onAdd={() => handleAddCandidate(election.id)}
                  onRemove={(cid) =>
                    confirmAction('¿Eliminar este candidato?', () =>
                      removeCandidate(election.id, cid),
                    )
                  }
                  previewUrl={previewUrl}
                />
              )}
            </div>
          );
        })}
      </div>

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={() => {
            confirm.action();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function CandidatePanel({
  election,
  users,
  candidateForm,
  setCandidateForm,
  onAdd,
  onRemove,
  previewUrl,
}: {
  election: Election;
  users: User[];
  candidateForm: {
    frontName: string;
    candidateName: string;
    position: Candidate['position'];
    mission: string;
    photoUrl: string;
    logoFrente: string;
    logoFile: File | null;
  };
  setCandidateForm: React.Dispatch<React.SetStateAction<typeof candidateForm>>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  previewUrl: string | null;
}) {
  const candidates = election.candidates ?? [];

  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  // Resetear el selector cuando el form se limpia después de agregar
  useEffect(() => {
    if (!candidateForm.candidateName) {
      setSelectedUserId('');
      setUserSearch('');
    }
  }, [candidateForm.candidateName]);

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.ru.toLowerCase().includes(q);
  });

  function handleUserSelect(userId: string) {
    const user = users.find((u) => u.id === userId);
    setSelectedUserId(userId);
    setCandidateForm((f) => ({ ...f, candidateName: user?.name ?? '' }));
  }

  const iStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-1)',
    outline: 'none',
  };

  return (
    <div
      className="border-t px-5 py-4 flex flex-col gap-4 animate-slide-up"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      {/* Candidate list */}
      {candidates.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Sin candidatos aún.
        </p>
      ) : (
        <ul className="list-none flex flex-col gap-2">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: 'var(--brand-light)',
                  color: 'var(--brand)',
                }}
              >
                {c.candidateName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: 'var(--text-1)' }}
                >
                  {c.candidateName}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: 'var(--text-2)' }}
                >
                  {c.frontName} · {c.position}
                </p>
              </div>
              {election.status === 'PROGRAMADA' && (
                <button
                  aria-label="Eliminar candidato"
                  className="p-1.5 rounded-lg border-0 cursor-pointer transition-opacity hover:opacity-75 shrink-0"
                  style={{
                    background: 'var(--error-bg)',
                    color: 'var(--error)',
                  }}
                  onClick={() => onRemove(c.id)}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add candidate form */}
      {election.status === 'PROGRAMADA' && (
        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p
            className="text-xs font-semibold flex items-center gap-1.5"
            style={{ color: 'var(--text-2)' }}
          >
            <UserPlus size={12} /> Agregar candidato
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Selector de usuario */}
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label
                className="text-[11px] font-semibold"
                style={{ color: 'var(--text-3)' }}
              >
                Nombre completo (usuario del sistema) *
              </label>
              <div className="flex flex-col gap-1">
                {/* Búsqueda */}
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-3)' }}
                  />
                  <input
                    className="w-full rounded-lg pl-7 pr-3 py-2 text-xs"
                    style={iStyle}
                    placeholder="Buscar por nombre o R.U.…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
                {/* Select */}
                <select
                  className="w-full rounded-lg px-3 py-2 text-xs cursor-pointer"
                  style={{
                    ...iStyle,
                    background: selectedUserId
                      ? 'var(--brand-light)'
                      : 'var(--surface)',
                    color: selectedUserId ? 'var(--brand)' : 'var(--text-2)',
                    fontWeight: selectedUserId ? 600 : 400,
                  }}
                  value={selectedUserId}
                  onChange={(e) => handleUserSelect(e.target.value)}
                  size={Math.min(filteredUsers.length + 1, 5)}
                >
                  <option value="">— Seleccionar usuario —</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.ru})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cargo, frente, misión, foto */}
            {[
              { ph: 'Cargo *', key: 'position' as const },
              { ph: 'Nombre del frente *', key: 'frontName' as const },
              { ph: 'Misión (opcional)', key: 'mission' as const },
              { ph: 'URL foto (opcional)', key: 'photoUrl' as const },
            ].map(({ ph, key }) => (
              <input
                key={key}
                className="rounded-lg px-3 py-2 text-xs"
                style={iStyle}
                placeholder={ph}
                value={candidateForm[key]}
                onChange={(e) =>
                  setCandidateForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            ))}

            {/* Logo del frente - Input file con preview */}
            <div className="sm:col-span-2 flex flex-col gap-2">
              <label
                className="text-[11px] font-semibold"
                style={{ color: 'var(--text-3)' }}
              >
                Logo del frente (opcional)
              </label>
              <div className="flex gap-3 items-start">
                {/* Preview del logo */}
                {(previewUrl || candidateForm.logoFrente) && (
                  <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-white overflow-hidden shrink-0">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Logo preview"
                        className="w-full h-full object-contain"
                      />
                    ) : candidateForm.logoFrente.startsWith('http') ? (
                      <img
                        src={candidateForm.logoFrente}
                        alt="Logo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={candidateForm.logoFrente}
                        alt="Logo"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                )}

                {/* Input file */}
                <div className="flex-1 flex flex-col gap-2">
                  <label
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border-2 border-dashed"
                    style={{
                      background: 'var(--surface)',
                      borderColor: candidateForm.logoFile
                        ? 'var(--brand)'
                        : 'var(--border)',
                      color: candidateForm.logoFile
                        ? 'var(--brand)'
                        : 'var(--text-3)',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setCandidateForm((f) => ({
                          ...f,
                          logoFile: file,
                          logoFrente: '',
                        }));
                      }}
                    />
                    📁{' '}
                    {candidateForm.logoFile
                      ? 'Cambiar logo'
                      : 'Seleccionar logo'}
                  </label>
                  {candidateForm.logoFile && (
                    <button
                      type="button"
                      className="text-[10px] text-red-600 font-semibold hover:text-red-700 transition-colors self-start"
                      onClick={() =>
                        setCandidateForm((f) => ({
                          ...f,
                          logoFile: null,
                          logoFrente: '',
                        }))
                      }
                    >
                      ✕ Eliminar logo
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                Formatos: PNG, JPG, SVG. Máx 2MB.
              </p>
            </div>

            <button
              className="sm:col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white border-0 cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--brand)' }}
              disabled={
                !candidateForm.candidateName ||
                !candidateForm.position ||
                !candidateForm.frontName
              }
              onClick={(e) => {
                e.preventDefault();
                console.log('Button clicked!', {
                  candidateName: candidateForm.candidateName,
                  position: candidateForm.position,
                  frontName: candidateForm.frontName,
                });
                onAdd();
              }}
            >
              <Plus size={12} />
              Agregar candidato
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Infraestructura Fabric ────────────────────────────────────────────────

function InfraPanel({
  channelName,
  channel,
  nodes,
}: {
  channelName: string;
  channel: FabricChannel | null;
  nodes: FabricNode[];
}) {
  const activeNodes = nodes.filter((n) => n.activo);
  const inactiveNodes = nodes.filter((n) => !n.activo);
  const channelActive = channel?.activo ?? true;

  return (
    <div
      className="px-5 py-4 flex flex-col gap-3"
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}
    >
      <p
        className="text-xs font-semibold flex items-center gap-1.5"
        style={{ color: 'var(--text-2)' }}
      >
        <Network size={13} />
        Infraestructura Fabric
      </p>

      {/* Canal */}
      <div className="flex flex-col gap-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-3)' }}
        >
          Canal
        </p>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-mono font-medium"
            style={{
              background: channelActive
                ? 'var(--status-active-bg, #dcfce7)'
                : 'var(--error-bg)',
              color: channelActive ? 'var(--status-active)' : 'var(--error)',
            }}
          >
            <Radio size={11} />
            {channelName}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {channelActive ? '● Activo' : '○ Inactivo'}
            {channel?.descripcion ? ` — ${channel.descripcion}` : ''}
          </span>
        </div>
      </div>

      {/* Nodos */}
      <div className="flex flex-col gap-1.5">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-3)' }}
        >
          Nodos ({activeNodes.length} activo
          {activeNodes.length !== 1 ? 's' : ''}
          {inactiveNodes.length > 0
            ? `, ${inactiveNodes.length} inactivo${inactiveNodes.length !== 1 ? 's' : ''}`
            : ''}
          )
        </p>
        {nodes.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Sin nodos registrados
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {[...activeNodes, ...inactiveNodes].map((node) => (
              <div
                key={node.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                style={{
                  background: node.activo ? 'var(--surface)' : 'transparent',
                  border: '1px solid var(--border)',
                  opacity: node.activo ? 1 : 0.5,
                }}
              >
                <Server
                  size={12}
                  style={{
                    color: node.activo
                      ? 'var(--status-active)'
                      : 'var(--text-3)',
                    flexShrink: 0,
                  }}
                />
                <span
                  className="font-semibold"
                  style={{ color: 'var(--text-1)', minWidth: '4rem' }}
                >
                  {node.nombre}
                </span>
                <code
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--brand)',
                  }}
                >
                  {node.endpoint}
                </code>
                <span style={{ color: 'var(--text-3)' }}>{node.hostAlias}</span>
                <span
                  className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: node.activo
                      ? 'var(--status-active-bg, #dcfce7)'
                      : 'var(--surface-2)',
                    color: node.activo
                      ? 'var(--status-active)'
                      : 'var(--text-3)',
                  }}
                >
                  {node.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Countdown ──────────────────────────────────────────────────────────────

function TimeRemaining({
  endDate,
  startDate,
  status,
}: {
  endDate: string;
  startDate: string;
  status: ElectionStatus;
}) {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, []);

  if (status === 'PROGRAMADA') {
    const msUntilStart = new Date(startDate).getTime() - now;
    if (msUntilStart <= 0) return null;
    return (
      <span
        className="flex items-center gap-1 text-xs mt-1"
        style={{ color: 'var(--text-3)' }}
      >
        <Clock size={11} />
        Inicia en {formatDuration(msUntilStart)}
      </span>
    );
  }

  const msLeft = new Date(endDate).getTime() - now;

  if (msLeft <= 0) {
    return (
      <span
        className="flex items-center gap-1 text-xs mt-1 font-semibold"
        style={{ color: 'var(--error)' }}
      >
        <Clock size={11} />
        Cerrando automáticamente…
      </span>
    );
  }

  const isUrgent = msLeft < 60 * 60 * 1000; // < 1 hora
  const isWarning = msLeft < 24 * 60 * 60 * 1000; // < 24 horas
  const color = isUrgent
    ? 'var(--error)'
    : isWarning
      ? '#f59e0b'
      : 'var(--status-active)';

  return (
    <span
      className="flex items-center gap-1 text-xs mt-1 font-medium"
      style={{ color }}
    >
      <Clock size={11} />
      Cierra en {formatDuration(msLeft)}
    </span>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
