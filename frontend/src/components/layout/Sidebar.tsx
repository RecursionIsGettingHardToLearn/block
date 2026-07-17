import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Vote,
  Users,
  ShieldCheck,
  BarChart2,
  BarChart,
  Server,
  Layers,
  ChevronRight,
  Lock,
  FileBarChart,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

const adminLinks = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/admin/elecciones', label: 'Elecciones', Icon: Vote },
  { to: '/admin/usuarios', label: 'Usuarios', Icon: Users },
  // { to: '/admin/auditoria',  label: 'Auditoría',   Icon: ShieldCheck }, // Oculto - solo accesible para perfil AUDITOR
  { to: '/admin/resultados', label: 'Resultados', Icon: BarChart2 },
  { to: '/admin/nodos', label: 'Nodos', Icon: Server },
  { to: '/admin/canales', label: 'Canales', Icon: Layers },
  { to: '/admin/ca', label: 'CA', Icon: Lock },
  { to: '/admin/reportes', label: 'Reportes', Icon: FileBarChart },
];

const voterLinks = [
  { to: '/votante/votar', label: 'Emitir Voto', Icon: Vote },
  { to: '/votante/resultados', label: 'Resultados', Icon: BarChart2 },
];

const auditorLinks = [
  { to: '/auditor/resultados', label: 'Resultados', Icon: BarChart },
  { to: '/auditor/validar', label: 'Validar voto', Icon: ShieldCheck },
  { to: '/auditor/reportes', label: 'Reportes', Icon: FileBarChart },
];

const rolMeta: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  ADMINISTRADOR: {
    label: 'Administrador',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
  VOTANTE: {
    label: 'Votante',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
  },
  AUDITOR: {
    label: 'Auditor',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
  },
};

export default function Sidebar() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isAuditor = useAuthStore((s) => s.isAuditor());
  const rol = useAuthStore((s) => s.getRolNormalizado()) ?? 'VOTANTE';

  const links = isAdmin ? adminLinks : isAuditor ? auditorLinks : voterLinks;
  const meta = rolMeta[rol] ?? rolMeta['VOTANTE'];

  return (
    <aside className="w-52 sm:w-64 shrink-0 flex flex-col py-6 bg-slate-50 border-r border-slate-200">
      {/* Logo Area */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <ShieldCheck size={20} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-tight text-slate-900">
              FICCT Vote
            </span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              Blockchain
            </span>
          </div>
        </div>
      </div>

      {/* Role Badge */}
      <div className="mx-4 mb-6 px-4 py-3 rounded-2xl flex items-center gap-3 bg-slate-100">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${meta.dot} animate-pulse-dot`}
          aria-hidden="true"
        />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Rol actual
          </span>
          <span
            className={`text-xs font-black uppercase tracking-tight truncate ${meta.color}`}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Navegación principal" className="flex-1">
        <div className="px-4 mb-3">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Menú
          </span>
        </div>
        <ul className="list-none flex flex-col gap-1 px-3">
          {links.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-500/10 to-transparent'
                      : 'hover:bg-slate-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={`relative p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                          : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                    <span
                      className={`flex-1 ${
                        isActive
                          ? 'font-semibold text-indigo-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {label}
                    </span>
                    {isActive && (
                      <ChevronRight
                        size={16}
                        className="text-indigo-600"
                        strokeWidth={2.5}
                      />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="mx-4 mt-auto pt-6 border-t border-slate-200">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
            <ShieldCheck size={14} className="text-slate-400" strokeWidth={2} />
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
              Seguro con
            </span>
            <span className="text-[10px] font-bold text-slate-600">
              Hyperledger Fabric
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
