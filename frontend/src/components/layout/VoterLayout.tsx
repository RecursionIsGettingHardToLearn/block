import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { LogOut, User } from 'lucide-react';

export default function VoterLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header Minimalista para Votante */}
      <header className="px-8 py-4 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg">
            V
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tighter text-slate-800">
              SISTEMA DE VOTACIÓN
            </h1>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">
              Sesión de Elector Oficial
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <User size={16} />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight leading-tight">
                {user?.name}
              </span>
              <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-[0.2em]">
                {user?.ru}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-red-600 hover:bg-red-50 transition-all text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-red-100"
          >
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </header>

      {/* Contenido a pantalla completa */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>

      <footer className="p-6 text-center opacity-20 text-[9px] font-bold uppercase tracking-[0.4em]">
        Elección Protegida por Criptografía e Inmutabilidad
      </footer>
    </div>
  );
}
