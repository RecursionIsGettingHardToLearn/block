import { useNavigate } from 'react-router-dom';
import { LogOut, Vote } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (user?.ru ?? '?').slice(0, 2).toUpperCase();

  return (
    <header
      className="flex items-center gap-4 px-5 h-14 shrink-0"
      style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        boxShadow: '0 2px 8px rgb(0 0 0 / .25)',
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 mr-auto">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/30">
          <Vote size={15} className="text-indigo-200" />
        </div>
        <span className="font-bold text-white tracking-tight text-sm">
          FICCT <span className="text-indigo-300 font-medium">E-Voting</span>
        </span>
      </div>

      {/* User info + logout */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: 'rgba(99,102,241,.45)' }}
            aria-hidden="true"
          >
            {initials}
          </div>
          <span className="text-slate-300 text-[13px] hidden sm:block max-w-[140px] truncate">
            {user?.name ?? user?.ru}
          </span>
        </div>

        <div className="w-px h-5 bg-white/10" aria-hidden="true" />

        <button
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          className="flex items-center gap-1.5 text-slate-300 hover:text-white text-xs px-2.5 py-1.5 rounded-md transition-colors hover:bg-white/10 cursor-pointer border-0 bg-transparent"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
