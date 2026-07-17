import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Vote,
  Minus,
  Ban,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { useElections } from '../../hooks/useElections';
import api from '../../api/axios.config';

interface VoteReceipt {
  electionId: string;
  txId: string;
  status: 'CONFIRMADO' | 'PENDIENTE' | 'FALLIDO';
  channel: string | null;
  createdAt: string;
  errorMessage: string | null;
}

export default function VotingPage() {
  const { elections, loading, error: electionsError } = useElections();

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [tallies, setTallies] = useState<
    Record<string, Record<string, number>>
  >({});
  // Por elección: si el desglose está oculto (elección ACTIVA) y cuántos votos
  // se han emitido (participación, sin revelar por quién).
  const [tallyMeta, setTallyMeta] = useState<
    Record<string, { ocultos: boolean; emitidos: number }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [votedInElections, setVotedInElections] = useState<Set<string>>(
    new Set(),
  );

  const activeElections = useMemo(
    () =>
      elections
        .filter((e) => e.status === 'ACTIVA')
        .map((e) => ({
          ...e,
          candidates: e.candidates.filter(
            (c) => !c.electionId || c.electionId === e.id,
          ),
        })),
    [elections],
  );
  const pendingElections = activeElections.filter(
    (e) => !votedInElections.has(e.id),
  );
  const allVoted =
    activeElections.length > 0 &&
    activeElections.every((e) => votedInElections.has(e.id));

  useEffect(() => {
    if (activeElections.length === 0) return;

    api
      .get<VoteReceipt[]>('/fabric/my-receipts')
      .then(({ data }) => {
        const receiptResults: Record<string, string> = {};
        const voted = new Set<string>();

        for (const receipt of data) {
          receiptResults[receipt.electionId] = receipt.txId;
          voted.add(receipt.electionId);
        }

        setResults((prev) => ({ ...receiptResults, ...prev }));
        setVotedInElections((prev) => new Set([...prev, ...voted]));
      })
      .catch(() => {});
  }, [activeElections]);

  useEffect(() => {
    if (!allVoted) return;

    Promise.all(
      activeElections.map(async (election) => {
        const { data } = await api.get<{
          results: Record<string, number>;
          resultadosOcultos?: boolean;
          participacion?: { emitidos: number };
        }>(`/fabric/results/${election.id}`);
        return [election.id, data] as const;
      }),
    )
      .then((entries) => {
        setTallies(
          Object.fromEntries(entries.map(([id, d]) => [id, d.results])),
        );
        setTallyMeta(
          Object.fromEntries(
            entries.map(([id, d]) => [
              id,
              {
                ocultos: d.resultadosOcultos ?? false,
                emitidos: d.participacion?.emitidos ?? 0,
              },
            ]),
          ),
        );
      })
      .catch(() => {});
  }, [allVoted, activeElections]);

  function toggleSelection(electionId: string, choiceId: string) {
    setSelections((prev) => ({
      ...prev,
      [electionId]: choiceId,
    }));
  }

  async function handleVote() {
    if (activeElections.length === 0) return;

    const missing = pendingElections.filter((e) => !selections[e.id]);
    if (missing.length > 0) {
      setError(`Falta seleccionar opciones`);
      return;
    }

    setSubmitting(true);
    setError(null);
    const newVotedElections = new Set(votedInElections);
    const newResults: Record<string, string> = { ...results };

    try {
      const failed: string[] = [];

      for (const election of pendingElections) {
        const candidateId = selections[election.id];
        try {
          const { data } = await api.post<{ txId: string }>('/fabric/vote', {
            electionId: election.id,
            candidateId,
          });
          newResults[election.id] = data.txId;
          newVotedElections.add(election.id);
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })
            ?.response?.data?.message;
          failed.push(`${election.title}: ${msg ?? 'no se pudo registrar'}`);
        }
      }

      setResults(newResults);
      setVotedInElections(newVotedElections);
      if (failed.length > 0) {
        setError(failed.join(' | '));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(msg ?? 'Error al registrar los votos.');
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  if (allVoted) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center gap-10 animate-fade-in py-20">
        {/* Success Icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full" />
          <div className="relative w-24 h-24 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-3xl flex items-center justify-center shadow-xl">
            <CheckCircle2 size={52} strokeWidth={2.5} />
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-3">
          <h2 className="text-4xl font-black tracking-tighter text-slate-900">
            Votación Completada
          </h2>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-[0.3em]">
            Tus votos han sido blindados en blockchain
          </p>
        </div>

        {/* Receipt Cards */}
        <div className="w-full space-y-3">
          {activeElections.length > 0 ? (
            activeElections.map((election) => (
              <div
                key={election.id}
                className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                    <ShieldCheck size={16} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                      {election.title}
                    </span>
                    <code className="block mt-1 text-[10px] text-slate-400 break-all font-mono leading-relaxed">
                      {results[election.id] ?? 'Registrado anteriormente'}
                    </code>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    Proceso Electoral
                  </span>
                  <code className="block mt-1 text-[10px] text-slate-400 break-all font-mono leading-relaxed">
                    Registrado anteriormente
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full space-y-6">
          {activeElections.map((election) => {
            const tally = tallies[election.id] ?? {};
            const total = Object.values(tally).reduce(
              (sum, count) => sum + count,
              0,
            );
            const rows = [
              ...election.candidates.map((candidate) => ({
                id: candidate.id,
                label: `${candidate.candidateName} — ${candidate.frontName}`,
                count: tally[candidate.id] ?? 0,
              })),
              {
                id: 'votos_blancos',
                label: 'Votos Blancos',
                count: tally.votos_blancos ?? 0,
              },
              {
                id: 'votos_nulos',
                label: 'Votos Nulos',
                count: tally.votos_nulos ?? 0,
              },
            ].sort((a, b) => b.count - a.count);

            return (
              <section
                key={election.id}
                className="w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4 mb-5">
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
                    {election.title}
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    {total} voto{total !== 1 ? 's' : ''}
                  </span>
                </div>
                {tallyMeta[election.id]?.ocultos ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 text-center">
                    <p className="text-sm font-bold text-slate-700 mb-1">
                      Resultados ocultos hasta el cierre
                    </p>
                    <p className="text-xs text-slate-500 mb-4">
                      Para no influir en quienes aún no votan, el conteo por
                      candidato se revela cuando la elección cierra.
                    </p>
                    <div className="inline-flex items-baseline gap-2">
                      <span className="text-3xl font-black text-indigo-600">
                        {tallyMeta[election.id]?.emitidos ?? 0}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        voto{tallyMeta[election.id]?.emitidos !== 1 ? 's' : ''}{' '}
                        emitido
                        {tallyMeta[election.id]?.emitidos !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rows.map((row) => {
                      const pct =
                        total > 0 ? Math.round((row.count / total) * 100) : 0;
                      return (
                        <div key={row.id}>
                          <div className="flex justify-between gap-4 text-xs font-bold text-slate-600 mb-1">
                            <span className="truncate">{row.label}</span>
                            <span className="shrink-0">
                              {row.count} · {pct}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-600 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* CTA Button */}
        <a
          href="/elecciones"
          className="group px-10 py-5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
        >
          Ver Resultados en Vivo
          <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">
            →
          </span>
        </a>
      </div>
    );
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full" />
          <Loader2
            size={48}
            className="relative animate-spin text-indigo-600 opacity-80"
          />
        </div>
      </div>
    );

  if (electionsError) {
    return (
      <div className="flex flex-col items-center justify-center p-32 gap-6">
        <Vote size={72} className="opacity-10 text-red-300" strokeWidth={1} />
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-widest text-red-400">
            Error al cargar elecciones
          </p>
          <p className="text-xs text-slate-500 mt-2">{electionsError}</p>
        </div>
      </div>
    );
  }

  if (activeElections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-32 gap-6 text-slate-300">
        <Vote size={72} className="opacity-10" strokeWidth={1} />
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">
            No hay papeletas activas
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Tu cuenta no está asignada a ningún canal con elección en curso
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto flex flex-col gap-20 animate-slide-up pb-48 pt-10">
        {/* Page Header */}
        <div className="text-center border-b border-slate-200 pb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full mb-4">
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse-dot" />
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">
              Centro de Votación Oficial
            </span>
          </div>
          <h2 className="text-5xl font-black tracking-tighter text-slate-900 mb-3">
            Emita Su Voto
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.4em]">
            Seleccione una opción por papeleta
          </p>
        </div>

        {/* Election Sections */}
        {activeElections.map((election, index) => {
          const hasVotedInThis = votedInElections.has(election.id);
          return (
            <section
              key={election.id}
              className="flex flex-col gap-8 animate-fade-in"
            >
              {/* Section Header */}
              <div className="flex items-center gap-5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black italic shadow-lg ${
                    hasVotedInThis
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-slate-900 text-white'
                  }`}
                >
                  {hasVotedInThis ? '✓' : index + 1}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {election.title}
                  </h3>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${
                      hasVotedInThis ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {hasVotedInThis ? '✓ Voto Registrado' : 'Elección Oficial'}
                  </p>
                </div>
              </div>

              {hasVotedInThis ? (
                <div className="text-center py-12 px-6 bg-emerald-50 rounded-2xl border-2 border-emerald-200">
                  <CheckCircle2
                    size={48}
                    className="text-emerald-600 mx-auto mb-3"
                    strokeWidth={2}
                  />
                  <p className="text-sm font-black text-emerald-700 uppercase tracking-tight">
                    Tu voto ha sido registrado en blockchain
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">
                    {results[election.id] && (
                      <>
                        txId:{' '}
                        <code className="break-all">
                          {results[election.id]}
                        </code>
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <>
                  {/* Candidate Cards - Centered */}
                  <div className="flex flex-wrap justify-center gap-5">
                    {election.candidates.map((c) => {
                      const isSelected = selections[election.id] === c.id;
                      return (
                        <div
                          key={c.id}
                          className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(25%-11.25px)] flex justify-center"
                        >
                          <button
                            onClick={() => toggleSelection(election.id, c.id)}
                            className={`group relative flex flex-col rounded-3xl overflow-hidden transition-all duration-300 w-full ${
                              isSelected
                                ? 'border-2 border-indigo-600 shadow-2xl ring-4 ring-indigo-500/25 scale-[1.03]'
                                : 'border border-slate-200 hover:border-indigo-300 hover:shadow-xl'
                            }`}
                          >
                            {/* Top accent line */}
                            <div
                              className={`h-1.5 w-full ${
                                isSelected
                                  ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600'
                                  : 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 group-hover:from-indigo-200 group-hover:via-indigo-300 group-hover:to-indigo-200'
                              } transition-all`}
                            />

                            {/* Info Area - Contenido principal */}
                            <div className="p-6 flex-1 flex flex-col items-center justify-center bg-white relative">
                              {/* Subtle background pattern */}
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-50/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                              <div className="relative z-10 flex flex-col items-center w-full">
                                {/* Logo del frente */}
                                <div className="w-24 h-24 rounded-2xl bg-white border-2 border-slate-100 shadow-lg flex items-center justify-center p-4 mb-4">
                                  {c.logoFrente &&
                                  c.logoFrente.startsWith('data:') ? (
                                    <img
                                      src={c.logoFrente}
                                      alt={c.frontName}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : c.logoFrente ? (
                                    <img
                                      src={c.logoFrente}
                                      alt={c.frontName}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center">
                                      <Users
                                        size={32}
                                        className="text-indigo-400"
                                        strokeWidth={1}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Nombre del candidato */}
                                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight line-clamp-2 mb-3">
                                  {c.candidateName}
                                </h4>

                                {/* Nombre del frente/partido */}
                                <span className="inline-block px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                  {c.frontName}
                                </span>
                              </div>
                            </div>

                            {/* Corner decoration - Check indicator */}
                            <div
                              className={`absolute top-4 right-4 w-8 h-8 rounded-full border-2 transition-all duration-300 ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg scale-110'
                                  : 'border-slate-200 bg-white text-transparent group-hover:border-indigo-400'
                              } flex items-center justify-center`}
                            >
                              <CheckCircle2 size={16} strokeWidth={3} />
                            </div>

                            {/* Bottom action bar */}
                            <div
                              className={`h-1.5 w-full transition-all duration-300 ${
                                isSelected
                                  ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400'
                                  : 'bg-slate-100 group-hover:bg-indigo-100'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}

                    {/* Blank & Null Options - Centered */}
                    <div className="col-span-1 sm:col-span-2 lg:col-span-4 mt-4 flex justify-center gap-3">
                      <button
                        onClick={() =>
                          toggleSelection(election.id, 'votos_blancos')
                        }
                        className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl border-2 transition-all duration-200 ${
                          selections[election.id] === 'votos_blancos'
                            ? 'bg-slate-100 border-slate-800'
                            : 'bg-white border-slate-200 opacity-50 hover:opacity-100'
                        }`}
                      >
                        <Minus
                          size={16}
                          className="text-slate-400"
                          strokeWidth={2.5}
                        />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                          Voto en Blanco
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          toggleSelection(election.id, 'votos_nulos')
                        }
                        className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl border-2 transition-all duration-200 ${
                          selections[election.id] === 'votos_nulos'
                            ? 'bg-red-50 border-red-600'
                            : 'bg-white border-slate-200 opacity-50 hover:opacity-100'
                        }`}
                      >
                        <Ban
                          size={16}
                          className="text-red-400"
                          strokeWidth={2.5}
                        />
                        <span className="text-[9px] font-black uppercase tracking-widest text-red-600">
                          Voto Nulo
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          );
        })}

        {/* Floating Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 flex flex-col items-center gap-4 z-40">
          {error && (
            <div className="px-5 py-3 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-200">
              {error}
            </div>
          )}
          <button
            onClick={() => setConfirming(true)}
            disabled={
              pendingElections.length === 0 ||
              pendingElections.some((e) => !selections[e.id])
            }
            className={`flex items-center gap-4 px-14 py-6 rounded-full text-sm font-black uppercase tracking-[0.25em] transition-all duration-300 active:scale-95 ${
              pendingElections.length > 0 &&
              pendingElections.every((e) => selections[e.id])
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 hover:-translate-y-0.5'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Vote size={22} strokeWidth={2.5} />
            Registrar Votos Oficiales
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirming && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-10 flex flex-col gap-6 shadow-2xl animate-scale-in border border-slate-200">
            {/* Modal Header */}
            <div className="text-center">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                Resumen Final
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-2">
                Verifique antes del registro inmutable
              </p>
            </div>

            {/* Selection Summary */}
            <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {pendingElections.map((e) => {
                const choiceId = selections[e.id];
                const candidate = e.candidates.find((c) => c.id === choiceId);
                const label =
                  choiceId === 'votos_blancos'
                    ? 'Voto en Blanco'
                    : choiceId === 'votos_nulos'
                      ? 'Voto Nulo'
                      : candidate?.candidateName;
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200"
                  >
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
                        {e.title}
                      </span>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tight mt-0.5">
                        {label}
                      </span>
                    </div>
                    <CheckCircle2
                      size={18}
                      className="text-indigo-600"
                      strokeWidth={2.5}
                    />
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleVote}
                disabled={submitting}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-black uppercase tracking-widest text-xs hover:from-indigo-500 hover:to-indigo-400 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Registrando en Blockchain...
                  </>
                ) : (
                  'SÍ, CONFIRMO MI VOTO'
                )}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-white text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:text-slate-700 transition-all border border-slate-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
