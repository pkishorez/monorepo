import { LockIcon } from '@kestack/web-platform/ui/components/lucide';
import type { Health } from '../../layer/capabilities/index.ts';
import { ago } from '../../ui/time/index.ts';

/*
 * What the app says of a Machine whose socket is not up, from its Health:
 * on its way, its tunnel broken, or the Machine down, with when it was
 * last seen. The header's pill, the sidebar and Settings say it alike,
 * each beside its dot.
 */

type Pill = readonly [label: string, title: string, tone: string];

/** What the pill says, more of it on hover, and its colour, while the Machine is out of reach. */
export const pillOf = (health: Health): Pill | null => {
  switch (health._tag) {
    case 'Connected':
      return null;
    case 'Unknown':
      return ['Connecting…', 'Connecting to the Machine…', 'bg-warning'];
    case 'Down':
      return [
        `Machine down · last seen ${ago(health.lastSeen)}`,
        'The Machine has not reported for a while: it may be off or asleep. What it last synced stays readable.',
        'bg-destructive',
      ];
  }
  const { status, lastSeen } = health;
  switch (status._tag) {
    case 'Installing':
      return [
        'Downloading cloudflared…',
        'The Machine is downloading cloudflared, once, to open its tunnel. On a slow network this takes a few minutes.',
        'bg-warning',
      ];
    case 'Opening':
      return [
        'Opening tunnel…',
        'The Machine is opening its tunnel to Cloudflare.',
        'bg-warning',
      ];
    case 'OpenFailed':
      return [
        'Tunnel failed · retrying',
        `The Machine could not open its tunnel: ${status.problem}. It tries again shortly.`,
        'bg-warning',
      ];
    case 'Unreachable':
      return [
        `Out of reach · seen ${ago(lastSeen)}`,
        `The Machine is up, but its tunnel is broken: ${status.problem}. Reconnecting…`,
        'bg-warning',
      ];
    case 'Unchecked':
    case 'Reachable':
      return [
        'Connecting…',
        `Connecting to the Machine, last seen ${ago(lastSeen)}…`,
        'bg-warning',
      ];
  }
};

/** The pill's word on a phone, where the header has room for little else. */
export const shortOf = (health: Health) =>
  health._tag === 'Down'
    ? 'Machine down'
    : health._tag === 'Seen' &&
        (health.status._tag === 'Unreachable' ||
          health.status._tag === 'OpenFailed')
      ? 'Out of reach'
      : 'Connecting…';

/** A Machine's Line as a dot says it: up, its Machine down, or on its way. */
export type Standing = 'Connected' | 'Down' | 'Connecting';

/**
 * How a Machine stands, as the sidebar's Machines say it: its dot, and a
 * few words, its Last Seen among them.
 */
export const standingOf = (
  health: Health,
  machine: { readonly lastSeen: number } | null,
): { readonly kind: Standing; readonly label: string } => ({
  kind:
    health._tag === 'Connected'
      ? 'Connected'
      : health._tag === 'Down'
        ? 'Down'
        : 'Connecting',
  label:
    pillOf(health)?.[0] ??
    (machine === null
      ? 'Connected'
      : `Connected · seen ${ago(machine.lastSeen)}`),
});

/** The dot of a Machine's standing, pulsing while it is on its way. */
export function StandingDot({ kind }: { readonly kind: Standing }) {
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        kind === 'Connected'
          ? 'bg-positive'
          : kind === 'Down'
            ? 'bg-destructive'
            : 'animate-pulse bg-warning motion-reduce:animate-none'
      }`}
    />
  );
}

/**
 * Why a Machine's setting can't be changed now, beside it: a lock and a
 * few words, the rest on hover. Drawn only while its Line is not connected.
 */
export function Locked({ health }: { readonly health: Health }) {
  const pill = pillOf(health);
  if (pill === null) return null;
  return (
    <span
      role="note"
      title={pill[1]}
      className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      <LockIcon aria-hidden className="size-3.5 shrink-0" />
      <span>Locked · {shortOf(health)}</span>
    </span>
  );
}

/** The dot beside it, in its colour, pulsing while the Machine is on its way. */
export function HealthDot({
  health,
  tone,
}: {
  readonly health: Health;
  readonly tone: string;
}) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {health._tag !== 'Down' && (
        <span
          className={`absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:hidden ${tone}`}
        />
      )}
      <span className={`relative size-2 rounded-full ${tone}`} />
    </span>
  );
}
