import { useCallback, useEffect, useState } from 'react';
import { Users, RefreshCw, BarChart2, Landmark } from 'lucide-react';
import { useElections } from '../../hooks/useElections';
import api from '../../api/axios.config';

/** Votos por candidato dentro de una elección: id de candidato -> total. */
type Tally = Record<string, number>;

export default function AdminResults() {
  const {
    elections,
    loading: loadingElections,
    fetchElections: refreshElections,
  } = useElections();
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [loadingTallies, setLoadingTallies] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Participación (padrón): quiénes podían votar en la elección seleccionada y
  // si votaron. Se consulta al backend cuando cambia la elección.
  interface Participation {
    total: number;
    votaron: number;
    noVotaron: number;
    votantes: {
      id: string;
      ru: string | null;
      nombre: string;
      email: string;
      voto: boolean;
    }[];
  }
  const [participation, setParticipation] = useState<Participation | null>(
    null,
  );
  const [loadingPart, setLoadingPart] = useState(false);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);

  // Solo se consulta el conteo de la elección elegida: antes se disparaba
  // una petición por CADA elección aunque se mirara una sola.
  const fetchTally = useCallback(async (electionId: string) => {
    setLoadingTallies(true);
    try {
      const { data } = await api.get<{ results?: Tally }>(
        `/fabric/results/${electionId}`,
      );
      setTallies((prev) => ({ ...prev, [electionId]: data.results ?? {} }));
    } catch (err) {
      console.error('Error al cargar resultados:', err);
    } finally {
      setLoadingTallies(false);
    }
  }, []);

  // Selección por defecto: la elección más relevante (ACTIVA primero, luego
  // la más reciente). Si la seleccionada desaparece, se reelige.
  useEffect(() => {
    const candidatas = elections.filter((e) => e.status !== 'BORRADOR');
    if (candidatas.length === 0) return;
    if (selectedId && candidatas.some((e) => e.id === selectedId)) return;
    const orden: Record<string, number> = {
      ACTIVA: 0,
      PROGRAMADA: 1,
      CERRADA: 2,
      ESCRUTADA: 3,
    };
    const primera = [...candidatas].sort((a, b) => {
      const d = (orden[a.status] ?? 9) - (orden[b.status] ?? 9);
      if (d !== 0) return d;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })[0];
    setSelectedId(primera.id);
  }, [elections, selectedId]);

  useEffect(() => {
    if (selectedId) void fetchTally(selectedId);
  }, [selectedId, fetchTally]);

  // Cargar el padrón de participación de la elección seleccionada.
  useEffect(() => {
    if (!selectedId) return;
    setLoadingPart(true);
    setShowOnlyMissing(false);
    api
      .get<Participation>(`/elections/${selectedId}/participation`)
      .then(({ data }) => setParticipation(data))
      .catch(() => setParticipation(null))
      .finally(() => setLoadingPart(false));
  }, [selectedId]);

  const refresh = () => {
    refreshElections();
    if (selectedId) void fetchTally(selectedId);
  };

  if (loadingElections)
    return (
      <div className="flex items-center justify-center h-96 text-indigo-600">
        <RefreshCw size={48} className="animate-spin opacity-20" />
      </div>
    );

  const statusOrder: Record<string, number> = {
    ACTIVA: 0,
    PROGRAMADA: 1,
    CERRADA: 2,
    ESCRUTADA: 3,
  };
  const displayElections = elections
    .filter((e) => e.status !== 'BORRADOR')
    .sort((a, b) => {
      const statusDiff =
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const selected =
    displayElections.find((e) => e.id === selectedId) ??
    displayElections[0] ??
    null;

  return (
    <div className="flex flex-col gap-8 animate-fade-in max-w-7xl mx-auto pb-32">
      {/* Cabecera de Gestión */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-[1.25rem] flex items-center justify-center shadow-inner">
            <BarChart2 size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
              Panel de Resultados
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em]">
              Auditoría y Escrutinio Administrativo
            </p>
          </div>
        </div>

        <button
          onClick={refresh}
          className="flex items-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
        >
          <RefreshCw size={20} />
          <span className="text-xs font-black uppercase tracking-widest">
            Actualizar
          </span>
        </button>
      </div>

      {!selected ? (
        <div className="text-center py-32 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 opacity-40 flex flex-col items-center gap-4">
          <Landmark size={64} />
          <p className="font-black uppercase tracking-[0.3em] text-xs">
            No hay procesos electorales registrados
          </p>
        </div>
      ) : (
        <>
          {/* Selector de elección */}
          <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 shrink-0">
              Ver resultados de
            </label>
            <select
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 px-4 py-3 rounded-2xl border-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 cursor-pointer"
            >
              {displayElections.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.status === 'ACTIVA'
                    ? '🟢 EN CURSO — '
                    : e.status === 'PROGRAMADA'
                      ? '🕐 PROGRAMADA — '
                      : e.status === 'ESCRUTADA'
                        ? '🏁 ESCRUTADA — '
                        : '🔒 CERRADA — '}
                  {e.title}
                </option>
              ))}
            </select>
          </div>

          {tallies[selected.id] === undefined && loadingTallies ? (
            <div className="flex items-center justify-center py-24 text-indigo-600">
              <RefreshCw size={32} className="animate-spin opacity-30" />
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              {[selected].map((election) => {
                const currentTally = tallies[election.id] || {};
                const totalVotos = Object.values(currentTally).reduce(
                  (a, b) => a + b,
                  0,
                );
                const isFinal =
                  election.status === 'CERRADA' ||
                  election.status === 'ESCRUTADA';

                // Crear lista completa incluyendo blancos y nulos
                const allResults = [
                  ...election.candidates.map((c) => ({
                    id: c.id,
                    name: c.candidateName,
                    frontName: c.frontName,
                    logoFrente: c.logoFrente,
                    photoUrl: c.photoUrl,
                    votos: currentTally[c.id] || 0,
                    isSpecial: false,
                  })),
                  {
                    id: 'votos_blancos',
                    name: 'Votos Blancos',
                    frontName: 'Voto válido sin candidato',
                    logoFrente: null,
                    photoUrl: null,
                    votos: currentTally['votos_blancos'] || 0,
                    isSpecial: true,
                    icon: 'blank',
                  },
                  {
                    id: 'votos_nulos',
                    name: 'Votos Nulos',
                    frontName: 'Voto inválido',
                    logoFrente: null,
                    photoUrl: null,
                    votos: currentTally['votos_nulos'] || 0,
                    isSpecial: true,
                    icon: 'null',
                  },
                ];

                // Ordenar por votos (descendente)
                const sortedResults = [...allResults].sort(
                  (a, b) => b.votos - a.votos,
                );
                const maxVotos =
                  sortedResults.length > 0 ? sortedResults[0].votos : 0;

                return (
                  <div key={election.id} className="flex flex-col gap-6">
                    {/* Election Header Card */}
                    <div
                      className={`text-white p-8 rounded-[2.5rem] shadow-xl overflow-hidden ${
                        election.status === 'ACTIVA'
                          ? 'bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-800'
                          : isFinal
                            ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-800'
                            : 'bg-gradient-to-br from-slate-900 to-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-3">
                            <div
                              className={`w-3 h-3 rounded-full ${
                                election.status === 'ACTIVA'
                                  ? 'bg-emerald-500 animate-pulse'
                                  : election.status === 'CERRADA'
                                    ? 'bg-amber-500'
                                    : 'bg-slate-500'
                              }`}
                            />
                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">
                              {isFinal
                                ? 'RESULTADO FINAL'
                                : election.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic leading-none">
                            {election.title}
                          </h3>
                          {election.description && (
                            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                              {election.description}
                            </p>
                          )}
                          {isFinal && (
                            <p className="text-[10px] text-emerald-300 mt-3 font-black uppercase tracking-[0.25em]">
                              Escrutinio consolidado con {totalVotos} voto
                              {totalVotos !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Stats Bar */}
                      <div className="grid grid-cols-3 bg-indigo-600/90 text-white py-5 mt-6 rounded-2xl">
                        <div className="flex flex-col items-center border-r border-white/20">
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">
                            Total Votos
                          </span>
                          <span className="text-3xl font-black italic">
                            {totalVotos}
                          </span>
                        </div>
                        <div className="flex flex-col items-center border-r border-white/20">
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">
                            Candidatos
                          </span>
                          <span className="text-3xl font-black italic">
                            {election.candidates.length}
                          </span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">
                            Cargo
                          </span>
                          <span className="text-lg font-black italic text-center px-4 line-clamp-2">
                            {election.candidates.length > 0
                              ? election.candidates[0].position || 'N/A'
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Results Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {sortedResults.map((result) => {
                        const v = result.votos;
                        const pct =
                          totalVotos > 0
                            ? ((v / totalVotos) * 100).toFixed(1)
                            : '0';
                        const leading = v === maxVotos && v > 0;

                        return (
                          <div
                            key={result.id}
                            className={`bg-white rounded-[2rem] border-2 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col relative ${
                              leading
                                ? 'border-amber-400 ring-2 ring-amber-400/30'
                                : 'border-slate-100'
                            }`}
                          >
                            {/* Logo del Frente (solo si es candidato y tiene logo) */}
                            {!result.isSpecial && result.logoFrente ? (
                              <div className="h-16 bg-slate-50 border-b border-slate-100 flex items-center justify-center p-3">
                                {result.logoFrente.startsWith('data:') ? (
                                  <img
                                    src={result.logoFrente}
                                    alt={result.frontName}
                                    className="h-12 w-auto object-contain"
                                  />
                                ) : (
                                  <img
                                    src={result.logoFrente}
                                    alt={result.frontName}
                                    className="h-12 w-auto object-contain"
                                  />
                                )}
                              </div>
                            ) : !result.isSpecial ? (
                              <div className="h-16 bg-slate-50 border-b border-slate-100 flex items-center justify-center p-3">
                                <Landmark
                                  size={28}
                                  className="text-slate-300"
                                />
                              </div>
                            ) : null}

                            {/* Leading Badge */}
                            {leading && !result.isSpecial && (
                              <div className="absolute right-3 mt-3 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 px-2 py-1 rounded-full text-[6px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg">
                                <Users size={8} strokeWidth={3} />
                                Líder
                              </div>
                            )}

                            <div className="p-6 flex flex-col items-center text-center flex-1">
                              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                                {result.isSpecial
                                  ? result.frontName
                                  : result.frontName}
                              </span>
                              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-4">
                                {result.name}
                              </h4>

                              <div className="w-full bg-slate-900 text-white rounded-[1.25rem] p-4 shadow-lg mt-auto">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[8px] font-black opacity-40 uppercase">
                                    Escrutinio
                                  </span>
                                  <span className="text-indigo-400 font-black italic text-base">
                                    {pct}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                                  <div
                                    className={`h-full transition-all duration-1000 ${leading ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest">
                                  {v} {v === 1 ? 'Voto' : 'Votos'}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Panel de participación (padrón): quiénes votaron y quiénes no */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Users size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                  Participación
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.25em]">
                  Padrón asignado al canal de esta elección
                </p>
              </div>
            </div>

            {loadingPart ? (
              <div className="flex justify-center py-10 text-indigo-600">
                <RefreshCw size={28} className="animate-spin opacity-30" />
              </div>
            ) : !participation || participation.total === 0 ? (
              <p className="text-center text-sm text-slate-400 py-10">
                No hay votantes asignados al canal de esta elección. Asígnalos
                desde la sección Usuarios.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-50 rounded-2xl p-4 text-center">
                    <div className="text-3xl font-black text-slate-800">
                      {participation.total}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">
                      Padrón
                    </div>
                  </div>
                  <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                    <div className="text-3xl font-black text-emerald-600">
                      {participation.votaron}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mt-1">
                      Votaron
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 text-center">
                    <div className="text-3xl font-black text-amber-600">
                      {participation.noVotaron}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 mt-1">
                      No votaron
                    </div>
                  </div>
                </div>

                {/* Barra de participación */}
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-widest">
                    {(
                      (participation.votaron / participation.total) *
                      100
                    ).toFixed(1)}
                    % de participación
                  </span>
                  <button
                    onClick={() => setShowOnlyMissing((v) => !v)}
                    className="px-3 py-1 rounded-lg cursor-pointer bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 transition-colors"
                  >
                    {showOnlyMissing
                      ? 'Ver todos'
                      : `Ver solo quienes no votaron (${participation.noVotaron})`}
                  </button>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-6">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${(participation.votaron / participation.total) * 100}%`,
                    }}
                  />
                </div>

                {/* Lista de votantes */}
                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        {['Registro', 'Nombre', 'Email', 'Estado'].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {participation.votantes
                        .filter((v) => !showOnlyMissing || !v.voto)
                        .map((v) => (
                          <tr
                            key={v.id}
                            className="border-b border-slate-50 last:border-b-0"
                          >
                            <td className="px-4 py-2">
                              <code className="text-xs text-slate-600">
                                {v.ru ?? '—'}
                              </code>
                            </td>
                            <td className="px-4 py-2 font-medium text-slate-800">
                              {v.nombre}
                            </td>
                            <td className="px-4 py-2 text-slate-500 text-xs">
                              {v.email}
                            </td>
                            <td className="px-4 py-2">
                              {v.voto ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                  ✓ Votó
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                                  ○ No votó
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
