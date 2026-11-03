import type { Session } from '@kestack/connect/code';
import { cn } from '@kestack/web-platform/ui/components/utils';

/*
 * What a Session is doing now, one way for every place that says it:
 * Running while its Turn runs, In the Background while only its
 * Background Jobs do, and idle otherwise, and the dots that mark it.
 * A turning circle in a row says Running and nothing else; In the
 * Background has its own, calmer mark, a small dot pulsing softly, so
 * work left going on is never mistaken for the agent answering. Beside a
 * title, Running is a green dot breathing.
 */

export type Activity = 'running' | 'background' | 'idle';

/** Whether its Turn runs, or only its Background Jobs do, or neither. */
export const activityOf = (
  status: Session['status'] | undefined,
  jobs: boolean,
): Activity =>
  status === 'running' ? 'running' : jobs ? 'background' : 'idle';

export const BACKGROUND = 'Working in the background';

/** Work going on beside a Turn, or after it: a small dot, pulsing softly unless motion is reduced. */
export function BackgroundDot({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/70 motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/** A session at work: a small green dot, breathing unless motion is reduced. */
export function RunningDot({ label = 'Running' }: { readonly label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="relative inline-flex size-2 shrink-0"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-positive opacity-40 motion-reduce:hidden" />
      <span className="relative size-2 rounded-full bg-positive" />
    </span>
  );
}
