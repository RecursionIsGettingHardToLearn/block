import { useRef, useState } from 'react';
import {
  ShieldCheck,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import jsQR from 'jsqr';
import api from '../../api/axios.config';

interface VoteVerification {
  txId: string;
  electionId: string | null;
  status: string;
  counted: boolean;
  channel: string | null;
  source: string;
  message: string;
}

/**
 * Permite al votante verificar su propio voto, de dos formas:
 * 1) Pegando el ID de transacción (txId).
 * 2) Subiendo la imagen del QR que descargó al votar (se lee con jsQR y se
 *    extrae el txId embebido).
 * En ambos casos consulta GET /fabric/verify/:txId y muestra el resultado.
 */
export default function VoterVerify() {
  const [txId, setTxId] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [resultado, setResultado] = useState<VoteVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function verificar(codigo: string) {
    const valor = codigo.trim();
    if (!valor || verificando) return;
    setVerificando(true);
    setError(null);
    setResultado(null);
    try {
      const { data } = await api.get<VoteVerification>(
        `/fabric/verify/${encodeURIComponent(valor)}`,
      );
      setResultado(data);
    } catch (err: unknown) {
      const detalle = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const msg = Array.isArray(detalle) ? detalle[0] : detalle;
      setError(msg ?? 'No se pudo verificar el voto.');
    } finally {
      setVerificando(false);
    }
  }

  // Lee el QR de una imagen subida y extrae el txId para verificarlo.
  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResultado(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('sin contexto');
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      if (!code) {
        setError('No se pudo leer un código QR en la imagen.');
        return;
      }
      setTxId(code.data);
      await verificar(code.data);
    } catch {
      setError('No se pudo procesar la imagen.');
    } finally {
      // Permite volver a subir el mismo archivo si hace falta.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-indigo-600" />
        <h3 className="text-sm font-black text-slate-800">Verifica tu voto</h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Pega tu ID de transacción o sube la imagen del QR que descargaste al
        votar, para confirmar que tu voto quedó registrado.
      </p>

      <div className="flex gap-2">
        <input
          value={txId}
          onChange={(e) => setTxId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && verificar(txId)}
          placeholder="Pega tu ID de transacción…"
          disabled={verificando}
          className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
        />
        <button
          onClick={() => verificar(txId)}
          disabled={verificando || !txId.trim()}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {verificando ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            'Verificar'
          )}
        </button>
      </div>

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onArchivo}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={verificando}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer disabled:opacity-50"
        >
          <Upload size={14} />
          Subir imagen del QR
        </button>
      </div>

      {error && (
        <div className="mt-4 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {resultado && (
        <div
          className={`mt-4 rounded-xl p-4 border ${
            resultado.counted
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {resultado.counted ? (
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <XCircle size={20} className="text-amber-600" />
            )}
            <span
              className={`text-sm font-black ${
                resultado.counted ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {resultado.counted
                ? 'Voto verificado y contabilizado'
                : resultado.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">{resultado.message}</p>
          {resultado.channel && (
            <p className="text-[11px] text-slate-400 mt-1">
              Canal: {resultado.channel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
