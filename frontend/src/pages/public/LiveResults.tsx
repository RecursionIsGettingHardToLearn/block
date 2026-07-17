import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  Landmark,
  RefreshCw,
  TrendingUp,
  Minus,
  Ban,
} from 'lucide-react';
import { useElections } from '../../hooks/useElections';
import api from '../../api/axios.config';

/** Votos por candidato dentro de una elección: id de candidato -> total. */
type Tally = Record<string, number>;

export default function LiveResults() {
  const {
    elections,
    loading: loadingElections,
    fetchElections: refreshElections,
  } = useElections();
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  // Participación por elección (sin revelar por quién). Durante ACTIVA el
  // backend no manda el desglose; aquí solo mostramos cuántos votaron.
  const [participacion, setParticipacion] = useState<Record<string, number>>(
    {},
  );
  const [loadingTallies, setLoadingTallies] = useState(false);

  const fetchAllTallies = useCallback(async () => {
    if (elections.length === 0) return;
    setLoadingTallies(true);
    const newTallies: Record<string, Tally> = {};
    const newPart: Record<string, number> = {};
    try {
      await Promise.all(
        elections.map(async (e) => {
          if (e.status === 'ACTIVA') {
            try {
              const { data } = await api.get<{
                results?: Tally;
                participacion?: { emitidos: number };
              }>(`/fabric/results/${e.id}`);
              newTallies[e.id] = data.results ?? {};
              newPart[e.id] = data.participacion?.emitidos ?? 0;
            } catch {
              // Silencioso: una elección sin resultados no debe romper el resto
            }
          }
        }),
      );
      setTallies(newTallies);
      setParticipacion(newPart);
    } finally {
      setLoadingTallies(false);
    }
  }, [elections]);

  useEffect(() => {
    void fetchAllTallies();
  }, [fetchAllTallies]);

  const refresh = () => {
    refreshElections();
    fetchAllTallies();
  };

  if (loadingElections || loadingTallies)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full" />
          <RefreshCw
            size={48}
            className="relative animate-spin text-indigo-600 opacity-80"
          />
        </div>
      </div>
    );

  const displayElections = elections.filter((e) => e.status === 'ACTIVA');

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-16 animate-slide-up pb-48 pt-4">
      {/* Page Header */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 rounded-full mb-4">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse-dot" />
          <span className="text-[9px] font-black uppercase tracking-widest text-red-600">
            Monitoreo en Vivo
          </span>
        </div>
        <h2 className="text-5xl font-black tracking-tighter text-slate-900 mb-3">
          Resultados Electorales
        </h2>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.4em]">
          Datos en Tiempo Real desde Blockchain
        </p>
      </div>

      {displayElections.length === 0 && (
        <div className="text-center py-32 opacity-20">
          <Landmark size={64} className="mx-auto mb-4" strokeWidth={1} />
          <p className="font-black uppercase tracking-widest text-sm text-slate-400">
            No hay procesos activos en este momento
          </p>
        </div>
      )}

      {displayElections.map((election, idx) => {
        const currentTally = tallies[election.id] || {};
        // Durante ACTIVA el desglose viene vacío a propósito; la participación
        // llega por separado. Se usa esa para los totales.
        const emitidos = participacion[election.id] ?? 0;
        const totalVotos = emitidos;
        const habilitados = 100;
        const pendientes = Math.max(0, habilitados - emitidos);
        const resultadosOcultos = election.status === 'ACTIVA';

        // Crear lista completa incluyendo blancos y nulos
        const allResults = [
          ...election.candidates.map((c) => ({
            id: c.id,
            name: c.candidateName,
            frontName: c.frontName,
            logoFrente: c.logoFrente,
            votos: currentTally[c.id] || 0,
            isSpecial: false,
            icon: null,
          })),
          {
            id: 'votos_blancos',
            name: 'Votos Blancos',
            frontName: 'Voto válido sin candidato',
            logoFrente: null,
            votos: currentTally['votos_blancos'] || 0,
            isSpecial: true,
            icon: 'blank',
          },
          {
            id: 'votos_nulos',
            name: 'Votos Nulos',
            frontName: 'Voto inválido',
            logoFrente: null,
            votos: currentTally['votos_nulos'] || 0,
            isSpecial: true,
            icon: 'null',
          },
        ];

        // Ordenar por votos (descendente) para determinar el líder
        const sortedResults = allResults.sort((a, b) => b.votos - a.votos);

        // Encontrar el máximo de votos
        const maxVotos = sortedResults.length > 0 ? sortedResults[0].votos : 0;
        const isLeading = (votos: number) => votos === maxVotos && votos > 0;

        return (
          <section
            key={election.id}
            className="flex flex-col gap-6 animate-slide-up"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            {/* Election Header Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-[2.5rem] shadow-xl overflow-hidden">
              <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse-dot shadow-lg shadow-red-500/50" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">
                      Servicio en Vivo
                    </span>
                  </div>
                  <h3 className="text-3xl font-black tracking-tighter uppercase italic leading-none">
                    {election.title}
                  </h3>
                </div>
                <button
                  onClick={refresh}
                  className="p-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all group"
                >
                  <RefreshCw
                    size={18}
                    className="group-hover:rotate-45 transition-transform"
                  />
                </button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 bg-indigo-600/90 text-white py-5 border-t border-white/10">
                <div className="flex flex-col items-center border-r border-white/20">
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">
                    Habilitados
                  </span>
                  <span className="text-3xl font-black italic">
                    {habilitados}
                  </span>
                </div>
                <div className="flex flex-col items-center border-r border-white/20">
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">
                    Ya Votaron
                  </span>
                  <span className="text-3xl font-black italic text-emerald-300">
                    {emitidos}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">
                    Pendientes
                  </span>
                  <span className="text-3xl font-black italic text-amber-300">
                    {pendientes}
                  </span>
                </div>
              </div>
            </div>

            {/* Results Grid - Centered */}
            {resultadosOcultos ? (
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-10 text-center max-w-2xl mx-auto">
                <p className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">
                  Resultados ocultos hasta el cierre
                </p>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Mientras la votación está abierta, el conteo por candidato no
                  se publica para no influir en quienes aún no han votado. Solo
                  se muestra cuántas personas ya votaron. El desglose se
                  revelará cuando la elección cierre.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-5">
                {sortedResults.map((result) => {
                  const votos = result.votos;
                  const pct =
                    totalVotos > 0
                      ? ((votos / totalVotos) * 100).toFixed(1)
                      : '0.0';
                  const leading = isLeading(votos);

                  return (
                    <div
                      key={result.id}
                      className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.33%-11.25px)] xl:w-[calc(20%-12px)] flex justify-center"
                    >
                      <div
                        className={`w-full bg-white rounded-[2rem] overflow-hidden transition-all duration-300 group hover:shadow-2xl ${
                          leading
                            ? 'border-2 border-amber-400 shadow-xl shadow-amber-500/20'
                            : 'border border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {/* Top accent bar */}
                        <div
                          className={`h-2 w-full ${
                            leading
                              ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400'
                              : 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 group-hover:from-indigo-200 group-hover:via-indigo-300 group-hover:to-indigo-200'
                          } transition-all`}
                        />

                        {/* Info Area */}
                        <div className="p-5 flex flex-col items-center text-center">
                          {/* Logo or Icon */}
                          <div className="relative w-20 h-20 rounded-xl bg-white border-2 border-slate-100 shadow-md flex items-center justify-center p-3 mb-4">
                            {result.isSpecial ? (
                              <div className="w-full h-full rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
                                {result.icon === 'blank' ? (
                                  <Minus
                                    size={32}
                                    className="text-slate-400"
                                    strokeWidth={1.5}
                                  />
                                ) : (
                                  <Ban
                                    size={32}
                                    className="text-red-400"
                                    strokeWidth={1.5}
                                  />
                                )}
                              </div>
                            ) : result.logoFrente &&
                              result.logoFrente.startsWith('data:') ? (
                              <img
                                src={result.logoFrente}
                                alt={result.frontName}
                                className="w-full h-full object-contain"
                              />
                            ) : result.logoFrente ? (
                              <img
                                src={result.logoFrente}
                                alt={result.frontName}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center">
                                <Users
                                  size={32}
                                  className="text-indigo-400"
                                  strokeWidth={1.5}
                                />
                              </div>
                            )}

                            {/* Leading Badge */}
                            {leading && (
                              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest flex items-center gap-0.5 shadow-lg shadow-amber-500/30">
                                <TrendingUp size={8} strokeWidth={3} />
                                Líder
                              </div>
                            )}
                          </div>

                          {/* Name */}
                          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-tight line-clamp-2 h-8 flex items-center mb-2">
                            {result.name}
                          </h4>

                          {/* Front name */}
                          <span className="text-[8px] font-black uppercase text-indigo-500 tracking-widest mb-4 line-clamp-1">
                            {result.frontName}
                          </span>

                          {/* Result Badge */}
                          <div className="w-full mt-auto relative">
                            {/* Gradient background glow */}
                            <div
                              className={`absolute inset-0 rounded-2xl blur-lg opacity-40 ${
                                leading ? 'bg-amber-500' : 'bg-slate-900'
                              }`}
                            />

                            <div
                              className={`relative w-full rounded-2xl p-4 shadow-lg ${
                                leading
                                  ? 'bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-amber-950 shadow-amber-500/40'
                                  : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white'
                              }`}
                            >
                              <div className="text-3xl font-black italic tracking-tighter leading-none">
                                {pct}%
                              </div>
                              <div className="text-[9px] font-bold uppercase opacity-70 mt-1">
                                {votos} {votos === 1 ? 'Voto' : 'Votos'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* Integrity Footer */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-10 p-10 bg-white rounded-[3rem] border border-slate-200 shadow-sm mt-10">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 shadow-inner">
            <ShieldCheck size={42} strokeWidth={1.5} />
          </div>
          <div className="flex flex-col max-w-lg">
            <h4 className="font-black text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-2">
              Integridad del Proceso
            </h4>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Los datos mostrados son oficiales e inmutables, respaldados por
              tecnología blockchain Hyperledger Fabric.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 opacity-20 text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">
          <Landmark size={18} strokeWidth={1.5} />
          FICCT 2026
        </div>
      </div>
    </div>
  );
}
