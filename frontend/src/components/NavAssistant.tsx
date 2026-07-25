import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  ArrowRight,
  Mic,
  Square,
  Bot,
} from 'lucide-react';
import api from '../api/axios.config';
import { useAuthStore } from '../store/auth.store';

interface Destino {
  ruta: string;
  titulo: string;
}

/** Un turno del chat. Los del asistente pueden llevar destino y pasos. */
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  destino?: Destino | null;
  pasos?: string[];
}

/**
 * Asistente de navegación conversacional. Un chatbot flotante presente en
 * todas las páginas con sesión: el usuario escribe o habla (Whisper) lo que
 * necesita, el asistente conversa manteniendo el hilo y, cuando corresponde,
 * ofrece un botón que lleva directo a la pantalla. Solo sugiere destinos que
 * el rol puede ver (lo garantiza el backend).
 */
export default function NavAssistant() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [asking, setAsking] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Voz (Whisper): grabación con MediaRecorder; el audio va al backend.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, asking]);

  if (!token || !enabled) return null;

  async function preguntar(texto?: string) {
    const q = (texto ?? consulta).trim();
    if (!q || asking) return;
    setConsulta('');
    setError(null);
    // Se agrega el turno del usuario y se manda el historial previo (sin los
    // metadatos de destino/pasos, solo rol y contenido) para dar continuidad.
    const historial = turns.map((t) => ({ role: t.role, content: t.content }));
    const nuevos: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(nuevos);
    setAsking(true);
    try {
      const { data } = await api.post<{
        mensaje: string;
        destino: Destino | null;
        pasos: string[];
      }>('/nav-assistant/ask', { consulta: q, historial });
      setTurns([
        ...nuevos,
        {
          role: 'assistant',
          content: data.mensaje,
          destino: data.destino,
          pasos: data.pasos,
        },
      ]);
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

  function ir(destino: Destino) {
    navigate(destino.ruta);
    setOpen(false);
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos.');
    }
  }

  async function transcribeAudio(blob: Blob) {
    setRecording(false);
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('audio', blob, 'consulta.webm');
      const { data } = await api.post<{ texto: string }>(
        '/nav-assistant/transcribe',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      // Se coloca en el campo para revisar antes de enviar (no envía solo).
      setConsulta((prev) => (prev ? `${prev} ${data.texto}` : data.texto));
    } catch (err: unknown) {
      const detalle = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const msg = Array.isArray(detalle) ? detalle[0] : detalle;
      setError(msg ?? 'No se pudo transcribir el audio.');
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Asistente"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center cursor-pointer"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Panel del chatbot */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <span className="text-sm font-black">Asistente</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1 rounded-lg cursor-pointer hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>

          {/* Conversación */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {turns.length === 0 && (
              <div className="text-center text-xs text-slate-400 py-8 px-4">
                Hola 👋 Dime qué quieres hacer y te ayudo a llegar. Por ejemplo:
                «¿cómo asigno votantes a un canal?» o «quiero cerrar una
                elección». Puedes escribir o hablar con el micrófono.
              </div>
            )}

            {turns.map((turn, i) => (
              <div
                key={i}
                className={`flex ${
                  turn.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] flex flex-col gap-2 ${
                    turn.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      turn.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {turn.content}
                  </div>

                  {turn.pasos && turn.pasos.length > 0 && (
                    <ol className="text-xs text-slate-500 list-decimal list-inside flex flex-col gap-1 px-1">
                      {turn.pasos.map((paso, j) => (
                        <li key={j}>{paso}</li>
                      ))}
                    </ol>
                  )}

                  {turn.destino && (
                    <button
                      onClick={() => ir(turn.destino as Destino)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer hover:opacity-90"
                    >
                      Ir a {turn.destino.titulo}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {asking && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-500 px-4 py-2.5 rounded-2xl text-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Pensando…
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Entrada: micrófono + texto */}
          <div className="p-3 border-t border-slate-100 flex gap-2 shrink-0">
            <button
              onClick={toggleRecording}
              disabled={transcribing || asking}
              title={recording ? 'Detener' : 'Hablar'}
              className={`px-3 py-2.5 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                recording
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {transcribing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : recording ? (
                <Square size={16} />
              ) : (
                <Mic size={16} />
              )}
            </button>
            <input
              ref={inputRef}
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && preguntar()}
              placeholder={
                recording ? 'Grabando… habla ahora' : 'Escribe o habla…'
              }
              disabled={asking}
              className="flex-1 px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
            />
            <button
              onClick={() => preguntar()}
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
