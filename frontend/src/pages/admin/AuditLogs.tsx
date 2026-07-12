import { useState, useEffect } from 'react';
import { Search, Filter, Clock, CheckCircle2, XCircle } from 'lucide-react';
import api from '../../api/axios.config';
import type { BlockchainSyncLog, Election } from '../../types';
import { useElections } from '../../hooks/useElections';

const STATUS_META: Record<
  BlockchainSyncLog['status'],
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  PENDING: {
    label: 'Pendiente',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    Icon: Clock,
  },
  CONFIRMED: {
    label: 'Confirmado',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    Icon: CheckCircle2,
  },
  FAILED: {
    label: 'Fallido',
    color: 'text-red-600',
    bg: 'bg-red-50',
    Icon: XCircle,
  },
};

export default function AuditLogs() {
  const { elections } = useElections();
  const [logs, setLogs] = useState<BlockchainSyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [txFilter, setTxFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [electionFilter, setElectionFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get<BlockchainSyncLog[]>('/audit/logs', {
        params: { electionId: electionFilter || undefined },
      })
      .then(({ data }) => setLogs(data))
      .catch((err) => {
        console.error('Error al cargar logs de auditoría:', err);
        setError(
          'No se pudo cargar el historial de auditoría. Verifica que el backend esté disponible.',
        );
      })
      .finally(() => setLoading(false));
  }, [electionFilter]);

  const filtered = logs.filter((l) => {
    const matchTx = txFilter ? l.txId?.includes(txFilter) : true;
    const matchStatus = statusFilter ? l.status === statusFilter : true;
    return matchTx && matchStatus;
  });

  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-slide-up">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900">
          Auditoría Blockchain
        </h2>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Registro de transacciones en Hyperledger Fabric
        </p>
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
            placeholder="Filtrar por txId…"
            value={txFilter}
            onChange={(e) => setTxFilter(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <select
            className="pl-8 pr-3 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="FAILED">Fallido</option>
          </select>
        </div>
        <div className="relative min-w-[180px]">
          <select
            className="w-full pl-3 pr-8 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            value={electionFilter}
            onChange={(e) => setElectionFilter(e.target.value)}
          >
            <option value="">Todas las elecciones</option>
            {elections.map((e: Election) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        <span className="flex items-center text-xs ml-auto px-3 rounded-lg bg-slate-100 text-slate-600">
          {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <p className="font-semibold mb-1">Error al cargar los datos</p>
          <p>{error}</p>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <div className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-sm text-slate-500">
          <p>
            Mostrando {filtered.length} registro
            {filtered.length !== 1 ? 's' : ''} en caché
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-500">
          No hay registros{statusFilter || txFilter ? ' para este filtro' : ''}.
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[700px]">
              <thead>
                <tr className="bg-slate-50">
                  {['Estado', 'txId', 'Elección', 'Fecha', 'Error'].map((h) => (
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
                {filtered.map((log, i) => {
                  const meta = STATUS_META[log.status];
                  return (
                    <tr
                      key={log.id}
                      className={
                        i < filtered.length - 1
                          ? 'border-b border-slate-100'
                          : ''
                      }
                    >
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          <meta.Icon size={11} strokeWidth={2.5} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <code className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                          {log.txId ? `${log.txId.slice(0, 16)}…` : '—'}
                        </code>
                      </td>
                      <td className="px-5 py-3">
                        <code className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                          {log.electionId.slice(0, 8)}…
                        </code>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono max-w-[200px] truncate">
                        {log.errorMessage ? (
                          <span
                            className="text-red-600"
                            title={log.errorMessage}
                          >
                            {log.errorMessage.slice(0, 50)}
                            {log.errorMessage.length > 50 ? '…' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
