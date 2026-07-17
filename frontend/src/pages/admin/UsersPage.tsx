import { useEffect, useState } from 'react';
import {
  Search,
  UserPlus,
  Pencil,
  Trash2,
  AlertCircle,
  X,
  Layers,
} from 'lucide-react';
import api from '../../api/axios.config';
import type { CareerType, RoleType, User } from '../../types';

const ROLES: RoleType[] = ['VOTANTE', 'ADMINISTRADOR', 'AUDITOR'];
const CAREERS: CareerType[] = ['SISTEMAS', 'INFORMATICA', 'REDES'];

const ROLE_LABELS: Partial<Record<RoleType, string>> = {
  ESTUDIANTE: 'Estudiante',
  DOCENTE: 'Docente',
  ADMIN: 'Administrador',
  VOTANTE: 'Votante',
  ADMINISTRADOR: 'Administrador',
  AUDITOR: 'Auditor',
};

const CAREER_LABELS: Record<CareerType, string> = {
  SISTEMAS: 'Sistemas',
  INFORMATICA: 'Informática',
  REDES: 'Redes',
};

const EMPTY_FORM = {
  identificador: '',
  name: '',
  email: '',
  password: '',
  career: 'SISTEMAS' as CareerType,
  role: 'VOTANTE' as RoleType,
  channelNames: [] as string[],
};
type FormMode = { type: 'create' } | { type: 'edit'; user: User };
type UserFormPayload = {
  identificador?: string;
  name: string;
  email: string;
  password?: string;
  career?: CareerType;
  role: RoleType;
  channelNames: string[];
};

interface FabricChannel {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<FabricChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<FormMode | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<RoleType | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: userData }, { data: channelData }] = await Promise.all([
        api.get<User[]>('/users'),
        api.get<FabricChannel[]>('/channels'),
      ]);
      setUsers(userData);
      setChannels(channelData.filter((channel) => channel.activo));
    } catch {
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setMode({ type: 'create' });
  }
  function openEdit(user: User) {
    setForm({
      identificador: user.ru || '',
      name: user.name,
      email: user.email,
      password: '',
      career: (user.career || 'SISTEMAS') as CareerType,
      role: user.role,
      channelNames: user.channelNames ?? [],
    });
    setFormError('');
    setMode({ type: 'edit', user });
  }
  function closeForm() {
    setMode(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const channelNames = form.channelNames;
      const payload: UserFormPayload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        channelNames,
      };
      if (form.role === 'VOTANTE') payload.career = form.career;
      if (form.password) payload.password = form.password;

      if (mode?.type === 'create') {
        payload.identificador = form.identificador.trim();
        await api.post('/users', payload);
      } else if (mode?.type === 'edit') {
        await api.patch(`/users/${mode.user.id}`, payload);
      }
      await load();
      closeForm();
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      setFormError(
        Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al guardar'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`¿Eliminar al usuario ${user.name}?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      alert('No se pudo eliminar el usuario');
    }
  }

  async function handleToggle(user: User) {
    try {
      const { data } = await api.patch<User>(`/users/${user.id}`, {
        isEnabled: !user.isEnabled,
      });
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
    } catch {
      alert('Error al cambiar estado');
    }
  }

  function toggleChannel(channelName: string) {
    const current = form.channelNames;
    const next = current.includes(channelName)
      ? current.filter((item) => item !== channelName)
      : [...current, channelName];
    setForm({ ...form, channelNames: next });
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (u.ru || '').toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q);
    return matchSearch && (!filterRole || u.role === filterRole);
  });

  // Paginación en el cliente: la búsqueda y el filtro por rol siguen siendo
  // instantáneos sobre los datos en memoria; solo se recorta cuántas filas se
  // renderizan a la vez. Para el tamaño esperado del padrón, traer todo de una
  // vez es barato; lo que pesa es pintar cientos de filas.
  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // La página vive fuera del render en un estado; se corrige si queda fuera de
  // rango tras filtrar (p. ej. estabas en la página 5 y el filtro deja 1).
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageUsers = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (loading)
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <div className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      </div>
    );

  if (error)
    return (
      <div className="flex items-center gap-2 rounded-xl px-5 py-4 text-sm bg-red-50 text-red-700 border border-red-200">
        <AlertCircle size={15} />
        {error}
      </div>
    );

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            Gestión de Usuarios
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {users.length} usuario{users.length !== 1 ? 's' : ''} registrados
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 border-0 cursor-pointer transition-opacity hover:opacity-90"
        >
          <UserPlus size={14} />
          <span className="hidden sm:inline">Nuevo usuario</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Buscar por registro, nombre o email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="px-3 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          value={filterRole}
          onChange={(e) => {
            setFilterRole(e.target.value as RoleType | '');
            setPage(1);
          }}
        >
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <span className="flex items-center text-xs px-3 rounded-lg bg-slate-100 text-slate-600">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50">
                {[
                  'Registro',
                  'Nombre',
                  'Email',
                  'Carrera',
                  'Rol',
                  'Canales',
                  'Votó',
                  'Estado',
                  'Acciones',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center px-5 py-10 text-sm text-slate-500"
                  >
                    Sin resultados
                  </td>
                </tr>
              )}
              {pageUsers.map((user) => {
                const roleStyle = {
                  VOTANTE: { color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  ESTUDIANTE: {
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                  },
                  ADMINISTRADOR: { color: 'text-amber-600', bg: 'bg-amber-50' },
                  ADMIN: { color: 'text-amber-600', bg: 'bg-amber-50' },
                  AUDITOR: { color: 'text-violet-600', bg: 'bg-violet-50' },
                  DOCENTE: { color: 'text-blue-600', bg: 'bg-blue-50' },
                }[user.role] || { color: 'text-slate-600', bg: 'bg-slate-50' };

                return (
                  <tr
                    key={user.id}
                    className={`transition-colors border-b border-slate-100 last:border-b-0 ${!user.isEnabled ? 'opacity-40' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <code className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                        {user.ru}
                      </code>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {user.name}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {user.email}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {CAREER_LABELS[user.career]}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${roleStyle.bg} ${roleStyle.color}`}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {user.channelNames?.length ? (
                        user.channelNames.map((channel) => (
                          <span
                            key={channel}
                            className="inline-flex mr-1 mb-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono"
                          >
                            {channel}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400">Sin canal</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-emerald-600">
                      {user.hasVoted ? '✓ Sí' : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleToggle(user)}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold cursor-pointer transition-opacity hover:opacity-75 ${
                          user.isEnabled
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {user.isEnabled ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openEdit(user)}
                          aria-label="Editar usuario"
                          className="p-1.5 rounded-lg cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          aria-label="Eliminar usuario"
                          className="p-1.5 rounded-lg cursor-pointer bg-red-50 text-red-600 hover:opacity-80 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación: solo si hay más de una página */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-sm">
            <span className="text-slate-500">
              Mostrando {pageStart + 1}–
              {Math.min(pageStart + PAGE_SIZE, filtered.length)} de{' '}
              {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="px-3 text-slate-600 font-semibold">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 rounded-lg cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {mode && (
        <div
          className="fixed inset-0 flex items-start justify-center z-50 p-3 sm:p-4 animate-fade-in bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
          onClick={closeForm}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-xl mt-2 sm:mt-4 bg-white rounded-2xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[calc(100vh-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {mode.type === 'create'
                    ? 'Registrar Nuevo Usuario'
                    : 'Editar Perfil de Usuario'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {mode.type === 'create'
                    ? 'Completa los datos para el nuevo miembro del padrón.'
                    : 'Actualiza la información del usuario seleccionado.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col gap-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Identificador / Registro */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="identificador"
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Registro (R.U. / C.I.)
                  </label>
                  <input
                    id="identificador"
                    type="text"
                    value={form.identificador}
                    required
                    disabled={mode.type === 'edit'}
                    onChange={(e) =>
                      setForm({ ...form, identificador: e.target.value })
                    }
                    placeholder="Ej: 21900123"
                    className={`w-full rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${mode.type === 'edit' ? 'opacity-70 cursor-not-allowed' : ''}`}
                  />
                </div>

                {/* Email */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="email"
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Correo Institucional
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    required
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="usuario@uagrm.edu.bo"
                    className="w-full rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Nombre Completo */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="name"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
                >
                  Nombre Completo
                </label>
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  required
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Juan Perez Garcia"
                  className="w-full rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Carrera */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="career"
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Carrera / Facultad
                  </label>
                  <select
                    id="career"
                    className="w-full rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all"
                    value={form.career}
                    onChange={(e) =>
                      setForm({ ...form, career: e.target.value as CareerType })
                    }
                  >
                    {CAREERS.map((c) => (
                      <option key={c} value={c}>
                        {CAREER_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rol */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="role"
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Rol de Acceso
                  </label>
                  <select
                    id="role"
                    className="w-full rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all"
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value as RoleType })
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Contraseña */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="pwd"
                  className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
                >
                  {mode.type === 'edit'
                    ? 'Cambiar Contraseña (Opcional)'
                    : 'Contraseña de Acceso'}
                </label>
                <input
                  id="pwd"
                  type="password"
                  value={form.password}
                  required={mode.type === 'create'}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={
                    mode.type === 'edit'
                      ? 'Dejar en blanco para no cambiar'
                      : 'Mínimo 6 caracteres'
                  }
                  minLength={6}
                  className="w-full rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              {form.role === 'VOTANTE' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-indigo-500" />
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Canales electorales
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {channels.length === 0 ? (
                      <div className="col-span-full rounded-xl px-4 py-3 text-xs bg-amber-50 border border-amber-200 text-amber-700">
                        No hay canales activos para asignar.
                      </div>
                    ) : (
                      channels.map((channel) => {
                        const selected = form.channelNames.includes(
                          channel.nombre,
                        );
                        return (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => toggleChannel(channel.nombre)}
                            className={`text-left rounded-xl px-4 py-3 border transition-all ${
                              selected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <div className="text-xs font-bold font-mono">
                              {channel.nombre}
                            </div>
                            <div className="text-[11px] opacity-70 truncate">
                              {channel.descripcion ?? 'Sin descripción'}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    El votante solo verá elecciones activas de los canales
                    marcados.
                  </p>
                </div>
              )}

              {formError && (
                <div className="flex items-start gap-3 rounded-2xl px-4 py-3 text-xs bg-red-50 border border-red-200 text-red-700">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
            </form>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-white text-slate-600 border border-slate-200 cursor-pointer transition-all hover:bg-slate-50 active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={saving}
                className="px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 cursor-pointer shadow-lg shadow-indigo-500/25 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Guardando…</span>
                  </div>
                ) : mode.type === 'create' ? (
                  'Crear Usuario'
                ) : (
                  'Guardar Cambios'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
