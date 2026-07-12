import { useState } from 'react';
import type { ClipboardEvent } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import api from '../../api/axios.config';
import { useElections } from '../../hooks/useElections';

interface VoteVerification {
  txId: string;
  electionId: string | null;
  status: 'CONFIRMADO' | 'PENDIENTE' | 'FALLIDO' | 'NO_ENCONTRADO';
  counted: boolean;
  channel: string | null;
  source: 'FABRIC' | 'LOCAL' | 'DESCONOCIDO';
  message: string;
}

export default function VoteValidator() {
  const { elections } = useElections();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VoteVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function normalizeCode(value: string): string {
    const text = value.trim();
    const localMatches = text.match(/LOCAL-[0-9a-fA-F-]{36}/g);
    if (localMatches?.length) return localMatches[localMatches.length - 1];

    const fabricTxMatches = text.match(/\b[0-9a-fA-F]{64}\b/g);
    if (fabricTxMatches?.length)
      return fabricTxMatches[fabricTxMatches.length - 1];

    return text
      .replace(/^txId\s*[:=]\s*/i, '')
      .replace(/^transactionId\s*[:=]\s*/i, '')
      .trim();
  }

  function updateCode(value: string) {
    setCode(normalizeCode(value));
    setResult(null);
    setError('');
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    updateCode(event.clipboardData.getData('text'));
  }

  async function pasteFromClipboard() {
    setError('');
    try {
      const text = await navigator.clipboard.readText();
      updateCode(text);
    } catch {
      setError('No se pudo leer el portapapeles. Pega el código con Ctrl+V.');
    }
  }

  async function validate() {
    const txId = normalizeCode(code);
    if (!txId) return;

    setCode(txId);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.get<VoteVerification>(
        `/fabric/verify/${encodeURIComponent(txId)}`,
      );
      setResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(msg ?? 'No se pudo validar el código');
    } finally {
      setLoading(false);
    }
  }

  const election = result?.electionId
    ? elections.find((item) => item.id === result.electionId)
    : null;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-slide-up">
      <div className="bg-slate-950 text-white rounded-[2rem] p-8 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-emerald-950 flex items-center justify-center">
            <ShieldCheck size={30} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Validación de Voto
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.25em] mt-1">
              Verifica si un código fue contado
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] p-5 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={code}
            onChange={(e) => updateCode(e.target.value)}
            onPaste={handlePaste}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') validate();
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full pl-11 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
            placeholder="Pegar txId o código LOCAL-..."
          />
        </div>
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="px-5 py-4 rounded-2xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
          title="Pegar desde portapapeles"
        >
          <span className="inline-flex items-center gap-2">
            <ClipboardPaste size={14} />
            Pegar
          </span>
        </button>
        <button
          onClick={validate}
          disabled={loading || !code.trim()}
          className="px-7 py-4 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
        >
          {loading ? 'Validando...' : 'Validar'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm font-semibold">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`rounded-[2rem] border p-7 shadow-sm ${
            result.counted
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                result.counted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {result.counted ? (
                <CheckCircle2 size={26} />
              ) : (
                <XCircle size={26} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-xl font-black uppercase tracking-tight ${
                  result.counted ? 'text-emerald-800' : 'text-red-800'
                }`}
              >
                {result.counted ? 'Voto contado' : 'Voto no contado'}
              </h3>
              <p className="text-sm mt-1 text-slate-600">{result.message}</p>

              <div className="grid sm:grid-cols-2 gap-3 mt-6">
                <Info label="Código" value={result.txId} mono />
                <Info label="Origen" value={result.source} />
                <Info label="Canal" value={result.channel ?? 'No registrado'} />
                <Info label="Estado" value={result.status} />
                <Info
                  label="Elección"
                  value={
                    election?.title ?? result.electionId ?? 'No encontrada'
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-white/70 border border-white rounded-2xl p-4 min-w-0">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
        {label}
      </p>
      <p
        className={`text-sm font-bold text-slate-800 break-all ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
