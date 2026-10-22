import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';

type Machine = typeof MachineSchema.Type;

/*
 * What can be said of a Machine from its record alone: where its socket
 * is, which Machine to open first, and, while its socket is not up, why
 * not. A Machine reports itself on every Heartbeat, every 15 seconds; one
 * whose Last Seen is older than three of them is down. One seen lately
 * whose tunnel check failed, or that has no address, is up but out of
 * reach: its tunnel is broken.
 */

/** How often a Machine reports itself, and the list is asked again. */
export const HEARTBEAT = 15_000;

/** A Machine not seen for this long is down. */
export const DOWN_AFTER = 3 * HEARTBEAT;

/**
 * The socket of a Machine at its public `https://` address, `wss://…/rpc`;
 * null for any other address, which is never dialled: the Machine Key
 * would cross in clear.
 */
export const socketUrl = (url: string | null) =>
  url?.startsWith('https://') === true
    ? `wss://${url.slice('https://'.length).replace(/\/+$/, '')}/rpc`
    : null;

/** The Machine to open: the one last used here, if still listed, else the one seen last; null with none. */
export const choose = (
  machines: ReadonlyArray<Machine>,
  last: string | null,
): Machine | null =>
  machines.find(({ id }) => id === last) ??
  machines.reduce<Machine | null>(
    (best, each) =>
      best === null || each.lastSeen > best.lastSeen ? each : best,
    null,
  );

/** The socket to the Machine now. */
export type Connection = 'connecting' | 'connected' | 'reconnecting';

/** Why a Machine's socket is not up, or that it is. */
export type Health =
  | { readonly _tag: 'Connected' }
  /** Not listed yet: nothing known of it. */
  | { readonly _tag: 'Unknown' }
  /** Seen lately and its tunnel works: the socket is on its way. */
  | { readonly _tag: 'Connecting'; readonly lastSeen: number }
  /** Seen lately, but out of reach at its address. */
  | {
      readonly _tag: 'TunnelBroken';
      readonly lastSeen: number;
      readonly problem: string | null;
    }
  /** Not seen for three Heartbeats. */
  | { readonly _tag: 'Down'; readonly lastSeen: number };

export const health = (
  machine: Machine | null,
  connection: Connection,
  now: number,
): Health => {
  if (connection === 'connected') return { _tag: 'Connected' };
  if (machine === null) return { _tag: 'Unknown' };
  const { lastSeen, url, tunnel } = machine;
  if (now - lastSeen > DOWN_AFTER) return { _tag: 'Down', lastSeen };
  if (url === null)
    return { _tag: 'TunnelBroken', lastSeen, problem: 'It has no address' };
  if (tunnel !== null && !tunnel.ok)
    return { _tag: 'TunnelBroken', lastSeen, problem: tunnel.problem };
  return { _tag: 'Connecting', lastSeen };
};

/** The tunnel as Settings says it: working, broken and why, or not checked yet. */
export const tunnelOf = (machine: Machine) =>
  machine.url === null
    ? 'No address'
    : machine.tunnel === null
      ? 'Not checked yet'
      : machine.tunnel.ok
        ? 'Tunnel working'
        : `Tunnel broken${machine.tunnel.problem === null ? '' : `: ${machine.tunnel.problem}`}`;
