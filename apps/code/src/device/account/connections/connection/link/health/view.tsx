import type { Health } from './health.ts';
import { ago } from '../../../../../../ui/labels/status/index.ts';

/*
 * What the app says of a Connection whose socket is not up, from its Health:
 * on its way, its tunnel broken, or the Connection down, with when it was
 * last seen. The header's pill, the sidebar and Settings say it alike,
 * each beside the one dot of its standing.
 */

type Pill = readonly [label: string, title: string];

/** What the pill says, and more of it on hover, while the Connection is out of reach. */
export const pillOf = (health: Health): Pill | null => {
  switch (health._tag) {
    case 'Linked':
      return null;
    case 'Unknown':
      return ['Connecting…', 'Connecting to the Connection…'];
    case 'Down':
      return [
        `Connection down · last seen ${ago(health.lastSeen)}`,
        'The Connection has not reported for a while: it may be off or asleep. What it last synced stays readable.',
      ];
  }
  const { status, lastSeen } = health;
  switch (status._tag) {
    case 'Installing':
      return [
        'Downloading cloudflared…',
        'The Connection is downloading cloudflared, once, to open its tunnel. On a slow network this takes a few minutes.',
      ];
    case 'Opening':
      return [
        'Opening tunnel…',
        'The Connection is opening its tunnel to Cloudflare.',
      ];
    case 'OpenFailed':
      return [
        'Tunnel failed · retrying',
        `The Connection could not open its tunnel: ${status.problem}. It tries again shortly.`,
      ];
    case 'Unreachable':
      return [
        `Out of reach · seen ${ago(lastSeen)}`,
        `The Connection is up, but its tunnel is broken: ${status.problem}. Relinking…`,
      ];
    case 'Unchecked':
    case 'Reachable':
      return [
        'Connecting…',
        `Connecting to the Connection, last seen ${ago(lastSeen)}…`,
      ];
  }
};

/** The pill's word on a phone, where the header has room for little else. */
export const shortOf = (health: Health) =>
  health._tag === 'Down'
    ? 'Connection down'
    : health._tag === 'Seen' &&
        (health.status._tag === 'Unreachable' ||
          health.status._tag === 'OpenFailed')
      ? 'Out of reach'
      : 'Connecting…';

/** A Connection's Link as a dot says it: up, its Connection down, or on its way. */
export type Standing = 'Linked' | 'Down' | 'Linking';

/**
 * How a Connection stands, as the sidebar's Connections say it: its dot, and a
 * few words, its Last Seen among them.
 */
export const standingOf = (
  health: Health,
  connection: { readonly lastSeen: number } | null,
): { readonly kind: Standing; readonly label: string } => ({
  kind:
    health._tag === 'Linked'
      ? 'Linked'
      : health._tag === 'Down'
        ? 'Down'
        : 'Linking',
  label:
    pillOf(health)?.[0] ??
    (connection === null
      ? 'Linked'
      : `Linked · seen ${ago(connection.lastSeen)}`),
});

/** The dot of a Connection's standing, pulsing while it is on its way. */
export function StandingDot({ kind }: { readonly kind: Standing }) {
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        kind === 'Linked'
          ? 'bg-positive'
          : kind === 'Down'
            ? 'bg-destructive'
            : 'animate-pulse bg-warning motion-reduce:animate-none'
      }`}
    />
  );
}
