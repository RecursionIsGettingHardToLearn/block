import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, X, Send, Loader2, ArrowRight } from 'lucide-react';
import api from '../api/axios.config';
import { useAuthStore } from '../store/auth.store';

interface NavSuggestion {
  mensaje: string;
  destino: { ruta: string; titulo: string } | null;
  pasos: string[];
}

/**
 * Asistente de navegación flotante. Aparece en todas las páginas cuando hay
 * sesión iniciada y el backend tiene la IA configurada. El usuario describe lo
 * que quiere hacer; el asistente sugiere a dónde ir (con un botón que lleva
 * directo) y unos pasos. Solo ofrece destinos que el rol puede ver: eso lo
 * garantiza el backend.
 */
export default function NavAssistant() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [asking, setAsking] = useState(false);
  const [suggestion, setSuggestion] = useState<NavSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Solo consultar disponibilidad cuando hay sesión.
  useEffect(() => {
    if (!token) {
      setEnabled(false);
      return;
    }
    api
      .get<{ enabled: boolean }>('/nav-assistant/status')
      .then(({ data }) => setEnabled(data.enabled))
      .catch(() => setEnabled(false));
  }, [token]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Sin sesión o sin IA configurada, no se muestra nada.
  if (!token || !enabled) return null;

  async function preguntar() {
    const q = consulta.trim();
    if (!q || asking) return;
    setAsking(true);
    setError(null);
    setSuggestion(null);
    try {
      const { data } = await api.post<NavSuggestion>('/nav-assistant/ask', {
        consulta: q,
      });
      setSuggestion(data);
    } catch (err: unknown) {
      const detalle = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const msg = Array.isArray(detalle) ? detalle[0] : detalle;
      setError(msg ?? 'No se pudo consultar el asistente.');
    } finally {
      setAsking(false);
    }
  }

  function ir() {
    if (!suggestion?.destino) return;
    navigate(suggestion.destino.ruta);
    // Cerrar y limpiar tras navegar, para no dejar el panel encima.
    setOpen(false);
    setConsulta('');
    setSuggestion(null);
  }

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Asistente de navegación"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center cursor-pointer"
        >
          <Compass size={24} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[92vw] max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
            <div className="flex items-center gap-2">
              <Compass size={18} />
              <span className="text-sm font-black">¿A dónde quieres ir?</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1 rounded-lg cursor-pointer hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-slate-500">
              Dime qué quieres hacer y te llevo. Por ejemplo: «asignar votantes
              a un canal» o «cerrar una elección».
            </p>

            {suggestion && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex flex-col gap-3">
                <p className="text-sm text-slate-700">{suggestion.mensaje}</p>

                {suggestion.pasos.length > 0 && (
                  <ol className="text-xs text-slate-500 list-decimal list-inside flex flex-col gap-1">
                    {suggestion.pasos.map((paso, i) => (
                      <li key={i}>{paso}</li>
                    ))}
                  </ol>
                )}

                {suggestion.destino && (
                  <button
                    onClick={ir}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer hover:opacity-90"
                  >
                    Ir a {suggestion.destino.titulo}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input
              ref={inputRef}
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && preguntar()}
              placeholder="Escribe lo que necesitas…"
              disabled={asking}
              className="flex-1 px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
            />
            <button
              onClick={preguntar}
              disabled={asking || !consulta.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {asking ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
