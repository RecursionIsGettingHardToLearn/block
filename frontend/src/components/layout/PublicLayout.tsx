import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header simplificado y elegante para la vista pública */}
      <header className="px-8 py-6 flex items-center justify-between border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-200">
            F
          </div>
          <div>
            <h1
              className="text-lg font-black tracking-tighter"
              style={{ color: 'var(--text-1)' }}
            >
              FICCT E-Voting
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">
              Portal de Resultados Públicos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            Servicio Oficial Activo
          </div>

          <a
            href="/votar"
            className="px-6 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
          >
            Emitir Voto
          </a>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>

      <footer className="p-8 text-center opacity-30 text-[10px] font-bold uppercase tracking-widest">
        Sistema de Votación Electrónica — Facultad de Ingeniería en Ciencias de
        la Computación y Telecomunicaciones
      </footer>
    </div>
  );
}
