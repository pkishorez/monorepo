import {
  Globe,
  ShieldAlert,
  Terminal,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import type { Venue } from 'laymos/story/schema';

import { stateStyles } from './state-style';
import type { ProofState } from './story-scope';

export function StateMark({
  state,
  className,
}: {
  readonly state: ProofState;
  readonly className?: string;
}) {
  return (
    <span className={cn('relative flex size-2 shrink-0', className)}>
      {state === 'running' && (
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-500/60 motion-reduce:hidden" />
      )}
      <span
        className={cn('relative size-2 rounded-full', stateStyles[state].mark)}
      />
    </span>
  );
}

export function StateLabel({
  state,
  className,
}: {
  readonly state: ProofState;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        stateStyles[state].text,
        className,
      )}
    >
      <StateMark state={state} />
      {stateStyles[state].label}
    </span>
  );
}

export function VenueLabel({
  venue,
  className,
}: {
  readonly venue: Venue;
  readonly className?: string;
}) {
  const Icon = venue === 'browser' ? Globe : Terminal;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {venue}
    </span>
  );
}

export function CriticalBadge({ className }: { readonly className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[5px] bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background',
        className,
      )}
    >
      <ShieldAlert className="size-3" aria-hidden />
      Critical
    </span>
  );
}
