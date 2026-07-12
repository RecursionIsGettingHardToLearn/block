import type { ElectionStatus } from '../../types';

const styleMap: Record<
  ElectionStatus,
  { color: string; bg: string; label: string }
> = {
  BORRADOR: {
    color: 'var(--status-draft)',
    bg: 'var(--status-draft-bg)',
    label: 'Borrador',
  },
  PROGRAMADA: {
    color: 'var(--status-sched)',
    bg: 'var(--status-sched-bg)',
    label: 'Programada',
  },
  ACTIVA: {
    color: 'var(--status-active)',
    bg: 'var(--status-active-bg)',
    label: 'Activa',
  },
  CERRADA: {
    color: 'var(--status-closed)',
    bg: 'var(--status-closed-bg)',
    label: 'Cerrada',
  },
  ESCRUTADA: {
    color: 'var(--status-counted)',
    bg: 'var(--status-counted-bg)',
    label: 'Escrutada',
  },
};

export default function StatusBadge({ status }: { status: ElectionStatus }) {
  const { color, bg, label } = styleMap[status] ?? styleMap['BORRADOR'];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ color, background: bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
