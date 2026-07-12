import {
  Vote,
  CheckCircle2,
  Clock,
  BarChart2,
  FileEdit,
  TrendingUp,
} from 'lucide-react';
import { useElections } from '../../hooks/useElections';
import StatusBadge from '../../components/common/StatusBadge';
import type { ElectionStatus } from '../../types';

const STATUSES: ElectionStatus[] = [
  'PROGRAMADA',
  'ACTIVA',
  'CERRADA',
  'ESCRUTADA',
];

const statMeta: Record<
  ElectionStatus,
  { Icon: React.ElementType; color: string; bg: string; gradient: string }
> = {
  PROGRAMADA: {
    Icon: Clock,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    gradient: 'from-blue-500 to-blue-600',
  },
  ACTIVA: {
    Icon: Vote,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  CERRADA: {
    Icon: CheckCircle2,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    gradient: 'from-amber-500 to-amber-600',
  },
  ESCRUTADA: {
    Icon: BarChart2,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    gradient: 'from-violet-500 to-violet-600',
  },
  BORRADOR: {
    Icon: FileEdit,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    gradient: 'from-slate-500 to-slate-600',
  },
};

const STATUS_LABEL: Record<ElectionStatus, string> = {
  BORRADOR: 'Borrador',
  PROGRAMADA: 'Programadas',
  ACTIVA: 'Activas',
  CERRADA: 'Cerradas',
  ESCRUTADA: 'Escrutadas',
};

export default function Dashboard() {
  const { elections, loading } = useElections();

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = elections.filter((e) => e.status === s).length;
    return acc;
  }, {});

  const totalElections = elections.length;

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
          <div className="w-10 h-10 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-6 sm:gap-8 animate-slide-up">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-slate-900">
            Dashboard
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Resumen del sistema de votación blockchain
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 rounded-2xl sm:self-center">
          <TrendingUp size={18} className="text-indigo-600" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-widest text-indigo-600">
              Total
            </span>
            <span className="text-lg font-black text-slate-900 leading-none">
              {totalElections}
            </span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUSES.map((s) => {
          const { Icon, color, bg, gradient } = statMeta[s];
          const count = counts[s] || 0;

          return (
            <div
              key={s}
              className="group relative bg-white rounded-2xl p-6 flex flex-col gap-4 border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
            >
              {/* Background Gradient Accent */}
              <div
                className={`absolute -right-8 -top-8 w-24 h-24 bg-gradient-to-br ${gradient} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`}
              />

              {/* Icon & Count */}
              <div className="flex items-center justify-between relative z-10">
                <span className="text-xs font-bold text-slate-600">
                  {STATUS_LABEL[s]}
                </span>
                <div
                  className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}
                >
                  <Icon size={18} className={color} strokeWidth={2.5} />
                </div>
              </div>

              <div className="relative z-10">
                <span className="text-4xl font-black text-slate-900 tracking-tighter">
                  {count}
                </span>
                <span className="text-xs text-slate-400 font-medium ml-2">
                  elecciones
                </span>
              </div>

              {/* Progress Bar Visual */}
              {totalElections > 0 && (
                <div className="relative z-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-500`}
                    style={{ width: `${(count / totalElections) * 100}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Elections Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="px-4 sm:px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Elecciones recientes
          </h3>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:inline">
            Últimas 5
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[600px]">
            <thead>
              <tr className="bg-slate-50">
                {['Título', 'Estado', 'Inicio', 'Fin'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {elections.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center px-4 sm:px-6 py-12">
                    <div className="flex flex-col items-center gap-3">
                      <FileEdit
                        size={32}
                        className="text-slate-300"
                        strokeWidth={1}
                      />
                      <span className="text-sm text-slate-500 font-medium">
                        No hay elecciones registradas
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {elections.slice(0, 5).map((e) => (
                <tr
                  key={e.id}
                  className="group hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 sm:px-6 py-4">
                    <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {e.title}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                      {new Date(e.startDate).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                      {new Date(e.endDate).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
