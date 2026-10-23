import type { Session } from '@kestack/ai-toolkit/api';

/*
 * How a Session stands, as one 6px dot, drawn only when it asks for
 * attention: a muted dot breathing slowly while it runs, still when motion
 * is reduced; a destructive one when its last Turn failed, and a warning
 * one when the server's stopping cut it off. Stopped by you, or idle, it
 * draws nothing. Each says what it means on hover and to a screen reader.
 */

const DOT = {
  running: {
    label: 'Running',
    className: 'bg-muted-foreground animate-breathe motion-reduce:animate-none',
  },
  failed: { label: 'Last turn failed', className: 'bg-destructive' },
  interrupted: {
    label: 'Interrupted by the server stopping',
    className: 'bg-warning',
  },
} as const;

export function StatusDot({ status }: { readonly status: Session['status'] }) {
  if (status === 'idle' || status === 'cancelled') return null;
  const { label, className } = DOT[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex size-3.5 shrink-0 items-center justify-center"
    >
      <span className={`size-1.5 rounded-full ${className}`} />
    </span>
  );
}
