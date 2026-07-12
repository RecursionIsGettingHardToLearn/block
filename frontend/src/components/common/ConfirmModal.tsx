import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ background: 'rgba(0,0,0,.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-msg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[360px] mx-4 rounded-2xl p-6 flex flex-col gap-5 animate-scale-in"
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Icon */}
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--error-bg)' }}
          >
            <AlertTriangle size={17} style={{ color: 'var(--error)' }} />
          </div>
          <div>
            <p
              className="font-semibold text-sm mb-1"
              style={{ color: 'var(--text-1)' }}
            >
              Confirmar acción
            </p>
            <p
              id="confirm-msg"
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-2)' }}
            >
              {message}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer border transition-colors"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-2)',
              borderColor: 'var(--border)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer border-0 transition-opacity hover:opacity-90"
            style={{ background: 'var(--error)', color: '#fff' }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
