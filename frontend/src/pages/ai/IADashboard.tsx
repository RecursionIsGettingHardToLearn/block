import { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Sparkles,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ChevronDown,
  Clock,
} from 'lucide-react';
import api from '../../api/axios.config';
import type { Election } from '../../types';
import { useElections } from '../../hooks/useElections';

/** Metadatos del modelo entrenado. */
interface EstadoModelo {
  entrenado: boolean;
  entrenadoEn?: string;
  nVotos?: number;
  tasaDeteccion?: number;
  falsosPositivosPct?: number;
  contamination?: number;
}

/** Un voto puntuado por el modelo. */
interface VotoPuntuado {
  id: string;
  idUsuario: string;
  idEleccion: string;
  creadoEn: string;
  direccionIp: string | null;
  anomalia: boolean;
  score: number;
  motivos: string[];
}

/** Respuesta de la detección para una elección. */
interface ReporteAnomalias {
  total: number;
  anomalas: number;
  resultados: VotoPuntuado[];
}

/** Extrae el mensaje de error del backend, con un texto por defecto. */
function mensajeError(err: unknown, porDefecto: string): string {
  return (
    (err as { response?: { data?: { message?: string } } }).response?.data
      ?.message ?? porDefecto
  );
}

export default function IADashboard() {
  const { elections } = useElections();

  // -- Estado del modelo ------------------------------------------------------
  const [estado, setEstado] = useState<EstadoModelo | null>(null);
  const [estadoError, setEstadoError] = useState('');
  const [entrenando, setEntrenando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');
  const inputArchivo = useRef<HTMLInputElement>(null);

  // -- Detección de anomalías -------------------------------------------------
  const [selectedId, setSelectedId] = useState('');
  const [anomalias, setAnomalias] = useState<ReporteAnomalias | null>(null);
  const [anomaliasError, setAnomaliasError] = useState('');
  const [analizando, setAnalizando] = useState(false);

  useEffect(() => {
    let activo = true;
    api
      .get<EstadoModelo>('/ai/status')
      .then(({ data }) => {
        if (activo) setEstado(data);
      })
      .catch((err) => {
        if (!activo) return;
        setEstado(null);
        setEstadoError(
          mensajeError(err, 'No se pudo consultar el estado del modelo.'),
        );
      });
    return () => {
      activo = false;
    };
  }, []);

  async function entrenar() {
    setEntrenando(true);
    setAviso('');
    setEstadoError('');
    try {
      const { data } = await api.post<EstadoModelo>('/ai/train');
      setEstado(data);
      setAviso('Modelo entrenado con los datos actuales.');
    } catch (err) {
      setEstadoError(mensajeError(err, 'No se pudo entrenar el modelo.'));
    } finally {
      setEntrenando(false);
    }
  }

  async function subirModelo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    setAviso('');
    setEstadoError('');
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      const { data } = await api.post<EstadoModelo>('/ai/upload', form);
      setEstado(data);
      setAviso(`Modelo "${archivo.name}" cargado correctamente.`);
    } catch (err) {
      setEstadoError(mensajeError(err, 'No se pudo subir el modelo.'));
    } finally {
      setSubiendo(false);
      if (inputArchivo.current) inputArchivo.current.value = '';
    }
  }

  async function analizar() {
    if (!selectedId) return;
    setAnalizando(true);
    setAnomaliasError('');
    setAnomalias(null);
    try {
      const { data } = await api.get<ReporteAnomalias>('/ai/anomalies', {
        params: { electionId: selectedId },
      });
      setAnomalias(data);
    } catch (err) {
      setAnomaliasError(
        mensajeError(err, 'El servicio de detección no está disponible.'),
      );
    } finally {
      setAnalizando(false);
    }
  }

  const pct = (v: number | undefined) =>
    v === undefined ? '—' : `${Math.round(v * 100)}%`;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            Inteligencia Artificial
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Modelo de detección de anomalías en la votación
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600">
          <Brain size={12} />
          Machine Learning
        </div>
      </div>

      {/* ── Bloque 1: modelo ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
          <Sparkles size={18} className="text-indigo-600" />
          <h3 className="text-sm font-black text-slate-800">El modelo</h3>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Estado */}
          {estadoError ? (
            <div className="flex items-start gap-3 rounded-xl p-4 bg-amber-50 border border-amber-200">
              <AlertTriangle
                size={20}
                className="text-amber-600 shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm font-black text-amber-700">
                  Servicio de IA no disponible
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{estadoError}</p>
              </div>
            </div>
          ) : estado?.entrenado ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-xl p-4 bg-emerald-50 border border-emerald-200">
                <CheckCircle2 size={22} className="text-emerald-600" />
                <div>
                  <p className="text-sm font-black text-emerald-700">
                    Modelo entrenado
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    {estado.entrenadoEn
                      ? new Date(estado.entrenadoEn).toLocaleString('es-BO')
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800">
                    {estado.nVotos ?? '—'}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                    Votos analizados
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600">
                    {pct(estado.tasaDeteccion)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                    Detección (prueba)
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-amber-600">
                    {pct(estado.falsosPositivosPct)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                    Falsos positivos
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl p-4 bg-slate-50 border border-slate-200">
              <Brain size={22} className="text-slate-400" />
              <div>
                <p className="text-sm font-black text-slate-700">
                  Modelo sin entrenar
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Entrena el modelo con los votos actuales o sube uno ya
                  entrenado.
                </p>
              </div>
            </div>
          )}

          {aviso && (
            <div className="rounded-xl px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-xs text-indigo-700 font-medium">
              {aviso}
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={entrenar}
              disabled={entrenando || subiendo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 border-0 cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {entrenando ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Entrenando…
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Entrenar modelo
                </>
              )}
            </button>

            <button
              onClick={() => inputArchivo.current?.click()}
              disabled={entrenando || subiendo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-300 cursor-pointer transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {subiendo ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Subiendo…
                </>
              ) : (
                <>
                  <Upload size={14} /> Subir modelo
                </>
              )}
            </button>
            <input
              ref={inputArchivo}
              type="file"
              accept=".joblib"
              onChange={subirModelo}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* ── Bloque 2: detección ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
          <ShieldAlert size={18} className="text-indigo-600" />
          <h3 className="text-sm font-black text-slate-800">
            Detección de anomalías
          </h3>
          {anomalias && (
            <span className="ml-auto text-xs text-slate-400">
              {anomalias.total} voto{anomalias.total !== 1 ? 's' : ''} analizado
              {anomalias.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Selector + acción */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <ChevronDown
                size={13}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
              />
              <select
                className="w-full pl-3.5 pr-8 py-2.5 rounded-lg text-sm bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setAnomalias(null);
                  setAnomaliasError('');
                }}
              >
                <option value="">Seleccionar elección…</option>
                {elections.map((e: Election) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={analizar}
              disabled={!selectedId || analizando}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 border-0 cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analizando ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Analizando…
                </>
              ) : (
                <>
                  <ShieldAlert size={14} /> Analizar votos
                </>
              )}
            </button>
          </div>

          {/* Resultados */}
          {anomaliasError ? (
            <div className="flex items-start gap-3 rounded-xl p-4 bg-amber-50 border border-amber-200">
              <AlertTriangle
                size={20}
                className="text-amber-600 shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm font-black text-amber-700">
                  Análisis no disponible
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {anomaliasError}
                </p>
              </div>
            </div>
          ) : anomalias && anomalias.total === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              No hay votos que analizar en esta elección.
            </div>
          ) : anomalias && anomalias.anomalas === 0 ? (
            <div className="flex items-center gap-3 rounded-xl p-4 bg-emerald-50 border border-emerald-200">
              <CheckCircle2 size={22} className="text-emerald-600" />
              <div>
                <p className="text-sm font-black text-emerald-700">
                  Sin anomalías detectadas
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  El modelo no marcó ningún voto como atípico en esta elección.
                </p>
              </div>
            </div>
          ) : (
            anomalias && (
              <>
                <div className="flex items-center gap-3 rounded-xl p-4 bg-red-50 border border-red-200">
                  <AlertTriangle size={22} className="text-red-600" />
                  <div>
                    <p className="text-sm font-black text-red-700">
                      {anomalias.anomalas} voto
                      {anomalias.anomalas !== 1 ? 's' : ''} marcado
                      {anomalias.anomalas !== 1 ? 's' : ''} como atípico
                      {anomalias.anomalas !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Requieren revisión manual. El modelo señala patrones
                      inusuales, no fraude confirmado.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-50">
                        {['Usuario', 'IP', 'Fecha', 'Score', 'Motivos'].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {anomalias.resultados
                        .filter((v) => v.anomalia)
                        .map((v) => (
                          <tr
                            key={v.id}
                            className="border-b border-slate-50 last:border-b-0"
                          >
                            <td className="px-4 py-2.5">
                              <code className="text-[11px] font-mono text-slate-600">
                                {v.idUsuario.slice(0, 8)}…
                              </code>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                              {v.direccionIp ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                              {new Date(v.creadoEn).toLocaleString('es-BO')}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs font-bold text-red-600 tabular-nums">
                                {v.score.toFixed(3)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {v.motivos.length > 0 ? (
                                  v.motivos.map((m) => (
                                    <span
                                      key={m}
                                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                                    >
                                      {m}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-400">
                                    patrón general atípico
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
