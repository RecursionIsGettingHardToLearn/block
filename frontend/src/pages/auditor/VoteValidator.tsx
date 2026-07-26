import { ShieldCheck } from 'lucide-react';
import VoteVerifier from '../../components/common/VoteVerifier';

/**
 * Pantalla de validación de voto del auditor. Conserva su cabecera distintiva
 * y usa el mismo componente de verificación que el votante (pegar txId o subir
 * la imagen del QR), para que ambos flujos sean idénticos.
 */
export default function VoteValidator() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-slide-up">
      {/* Cabecera del auditor */}
      <div className="bg-slate-950 text-white rounded-[2rem] p-8 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-emerald-950 flex items-center justify-center">
            <ShieldCheck size={26} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">
              Validación de Voto
            </h2>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 mt-1">
              Verifica si un código fue contado
            </p>
          </div>
        </div>
      </div>

      {/* Verificación: pegar txId o subir el QR (mismo componente que el
          votante). */}
      <VoteVerifier
        titulo="Validar un voto"
        descripcion="Pega el ID de transacción del voto o sube la imagen del QR del votante, para comprobar si quedó registrado y contabilizado en la blockchain."
      />
    </div>
  );
}
