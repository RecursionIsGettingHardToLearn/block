import { useState } from 'react';
import {
  Link2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ShieldCheck,
  BarChart,
  CheckCircle2,
  XCircle,
  Boxes,
} from 'lucide-react';
import api from '../../api/axios.config';
import type { TallyResult, Election } from '../../types';
import { useElections } from '../../hooks/useElections';
import StatusBadge from '../../components/common/StatusBadge';

/** Datos de auditoría que devuelve el backend. */
interface Auditoria {
  electionId: string;
  channel: string | null;
  estado: string;
  transacciones: {
    txId: string | null;
    estado: string;
    creadoEn: string;
    confirmadoEn: string | null;
  }[];
  integridad: {
    recibosConfirmados: number;
    votosEnLedger: number;
    coincide: boolean;
    pendientes: number;
    fallidos: number;
  };
}

export default function AuditorDashboard() {
  const { elections } = useElections();
  const [selectedId, setSelectedId] = useState('');
  const [tally, setTally] = useState<TallyResult | null>(null);
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const disponibles = elections.filter(
    (e: Election) =>
      e.status === 'ACTIVA' ||
      e.status === 'CERRADA' ||
      e.status === 'ESCRUTADA',
  );

  const selectedElection = elections.find((e) => e.id === selectedId) ?? null;

  async function fetchResults() {
    if (!selectedId) return;
    setError('');
    setLoading(true);
    try {
      // Se cargan en paralelo el conteo y los datos de auditoría (transacciones
      // e integridad), que es lo que distingue al panel del auditor.
      const [resTally, resAudit] = await Promise.all([
        api.get<TallyResult>(`/fabric/results/${selectedId}`),
        api.get<Auditoria>(`/fabric/audit/${selectedId}`),
      ]);
      setTally(resTally.data);
      setAuditoria(resAudit.data);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar los datos de auditoría del ledger');
      setTally(null);
      setAuditoria(null);
    } finally {
      setLoading(false);
    }
  }

  const totalVotes = tally
    ? Object.values(tally.results).reduce((a, b) => a + b, 0)
    : 0;

  // Crear lista completa incluyendo blancos y nulos
  const allResults = tally
    ? [
        ...(selectedElection?.candidates.map((c) => ({
          id: c.id,
          name: `${c.candidateName} — ${c.frontName}`,
          count: tally.results[c.id] || 0,
          isSpecial: false,
        })) || []),
        {
          id: 'votos_blancos',
          name: 'Votos en blanco',
          count: tally.results['votos_blancos'] || 0,
          isSpecial: true,
        },
        {
          id: 'votos_nulos',
          name: 'Votos nulos',
          count: tally.results['votos_nulos'] || 0,
          isSpecial: true,
        },
      ].sort((a, b) => b.count - a.count)
    : [];

  const inputBase: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-1)',
    outline: 'none',
  };

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            Panel de Auditoría
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            Solo lectura — datos directamente del ledger de Hyperledger Fabric
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            background: 'var(--status-sched-bg)',
            color: 'var(--status-sched)',
          }}
        >
          <ShieldCheck size={12} />
          Solo lectura
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-wrap gap-3 p-4 rounded-2xl items-center"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <ChevronDown
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-3)' }}
          />
          <select
            className="w-full px-3.5 py-2.5 rounded-lg text-sm appearance-none cursor-pointer pr-8"
            style={inputBase}
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setTally(null);
            }}
          >
            <option value="">Seleccionar elección…</option>
            {disponibles.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        {selectedId && selectedElection && (
          <StatusBadge status={selectedElection.status} />
        )}

        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white border-0 cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--brand)' }}
          onClick={fetchResults}
          disabled={!selectedId || loading}
        >
          {loading ? (
            <>
              <RefreshCw size={13} className="animate-spin" /> Consultando
              ledger…
            </>
          ) : (
            <>
              <Link2 size={13} /> Ver en blockchain
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs"
          style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
        >
          <AlertCircle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      {tally && (
        <div
          className="rounded-2xl overflow-hidden animate-slide-up"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Header */}
          <div
            className="px-5 py-3.5 flex items-center gap-2 border-b"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <BarChart size={14} style={{ color: 'var(--brand)' }} />
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}
            >
              Resultados del Ledger
            </span>
            <span
              className="ml-auto text-xs"
              style={{ color: 'var(--text-3)' }}
            >
              Actualizado: {new Date(tally.lastUpdated).toLocaleString()}
            </span>
          </div>

          {/* Summary */}
          <div
            className="px-5 py-3 border-b flex items-center gap-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <span
              className="text-2xl font-bold"
              style={{ color: 'var(--text-1)' }}
            >
              {totalVotes}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>
              voto{totalVotes !== 1 ? 's' : ''} registrados en blockchain
            </span>
          </div>

          {/* Results */}
          <div className="p-5 flex flex-col gap-4">
            {allResults.map((result, i) => {
              const pct =
                totalVotes > 0
                  ? Math.round((result.count / totalVotes) * 100)
                  : 0;
              const isFirst = i === 0 && result.count > 0;
              return (
                <div key={result.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-medium truncate max-w-xs"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {result.name}
                    </span>
                    <span
                      className="text-xs font-semibold ml-4 shrink-0 tabular-nums"
                      style={{
                        color: isFirst
                          ? 'var(--status-active)'
                          : 'var(--text-2)',
                      }}
                    >
                      {result.count} · {pct}%
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: isFirst
                          ? 'linear-gradient(90deg, var(--status-active), var(--brand))'
                          : 'var(--border-2)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Verificación de integridad: ledger vs. recibos */}
      {auditoria && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
            <ShieldCheck size={18} className="text-indigo-600" />
            <h3 className="text-sm font-black text-slate-800">
              Verificación de integridad
            </h3>
          </div>
          <div className="p-6">
            <div
              className={`flex items-center gap-3 rounded-xl p-4 mb-4 ${
                auditoria.integridad.coincide
                  ? 'bg-emerald-50 border border-emerald-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}
            >
              {auditoria.integridad.coincide ? (
                <CheckCircle2 size={22} className="text-emerald-600" />
              ) : (
                <XCircle size={22} className="text-amber-600" />
              )}
              <div>
                <p
                  className={`text-sm font-black ${
                    auditoria.integridad.coincide
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {auditoria.integridad.coincide
                    ? 'Integridad verificada'
                    : 'Discrepancia detectada'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {auditoria.integridad.coincide
                    ? 'Los votos contabilizados en la blockchain coinciden con los recibos confirmados.'
                    : 'El conteo del ledger no coincide con los recibos confirmados. Revisar los votos pendientes o fallidos.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-slate-800">
                  {auditoria.integridad.votosEnLedger < 0
                    ? '—'
                    : auditoria.integridad.votosEnLedger}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  En el ledger
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-slate-800">
                  {auditoria.integridad.recibosConfirmados}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  Recibos OK
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-amber-600">
                  {auditoria.integridad.pendientes}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  Pendientes
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-red-600">
                  {auditoria.integridad.fallidos}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  Fallidos
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transacciones en la blockchain */}
      {auditoria && auditoria.transacciones.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
            <Boxes size={18} className="text-indigo-600" />
            <h3 className="text-sm font-black text-slate-800">
              Transacciones en la blockchain
            </h3>
            <span className="ml-auto text-xs text-slate-400">
              {auditoria.transacciones.length} registro
              {auditoria.transacciones.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    ID de transacción
                  </th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Estado
                  </th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditoria.transacciones.map((t, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-50 last:border-b-0"
                  >
                    <td className="px-6 py-2.5">
                      <code className="text-[11px] font-mono text-slate-600 break-all">
                        {t.txId ?? '—'}
                      </code>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.estado === 'CONFIRMADO'
                            ? 'bg-emerald-50 text-emerald-600'
                            : t.estado === 'PENDIENTE'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {t.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(t.creadoEn).toLocaleString('es-BO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
