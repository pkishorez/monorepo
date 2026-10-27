import {
  addressOf,
  type Machine as MachineSchema,
  type MachineStatus,
} from '@kestack/connect/code';

type Machine = typeof MachineSchema.Type;

/*
 * What can be said of a Machine from its record alone: while its socket
 * is not up, why not; where its socket is, the Machines say
 * (`socketUrl`). A Machine reports itself on every Heartbeat, every 15
 * seconds; one whose Last Seen is older than three of them is down. One seen lately
 * says in its Machine Status how far its tunnel got: cloudflared
 * downloading, the tunnel opening or failed to open, or up and whether its
 * last check reached it. A record only as this device kept it is old by
 * nature, so it says nothing until it is checked: Cloud Connect answered,
 * its socket was up and dropped, or long enough passed (`Known.checked`);
 * until then the Machine is only connecting.
 */

/** How often a Machine reports itself, and the list is asked again. */
export const HEARTBEAT = 15_000;

/** A Machine not seen for this long is down. */
export const DOWN_AFTER = 3 * HEARTBEAT;

/** The socket to the Machine now. */
export type Connection = 'connecting' | 'connected' | 'reconnecting';

/** Why a Machine's socket is not up, or that it is. */
export type Health =
  | { readonly _tag: 'Connected' }
  /** Not listed yet, or listed only as kept and not checked: nothing believed of it. */
  | { readonly _tag: 'Unknown' }
  /** Seen lately: its status says how far its tunnel got. */
  | {
      readonly _tag: 'Seen';
      readonly lastSeen: number;
      readonly status: MachineStatus;
    }
  /** Not seen for three Heartbeats. */
  | { readonly _tag: 'Down'; readonly lastSeen: number };

export const health = (
  machine: Machine | null,
  connection: Connection,
  now: number,
  /** Whether the record can be believed: see `Known.checked`. */
  checked: boolean,
): Health => {
  if (connection === 'connected') return { _tag: 'Connected' };
  if (machine === null) return { _tag: 'Unknown' };
  // A socket up and dropped since is news; a kept record on its own is not.
  if (!checked && connection === 'connecting') return { _tag: 'Unknown' };
  const { lastSeen, status } = machine;
  if (now - lastSeen > DOWN_AFTER) return { _tag: 'Down', lastSeen };
  return { _tag: 'Seen', lastSeen, status };
};

/**
 * Whether a Machine is out of reach rather than on its way: down, or seen
 * with its tunnel not up. Unchecked and Reachable are a socket still
 * connecting.
 */
export const outOfReach = (
  health: Health,
): health is Extract<Health, { readonly lastSeen: number }> =>
  health._tag === 'Down' ||
  (health._tag === 'Seen' &&
    health.status._tag !== 'Unchecked' &&
    health.status._tag !== 'Reachable');

/** The Machine Status as Settings says it. */
export const statusOf = (status: MachineStatus) => {
  switch (status._tag) {
    case 'Installing':
      return 'Downloading cloudflared';
    case 'Opening':
      return 'Opening its tunnel';
    case 'OpenFailed':
      return `Tunnel failed to open: ${status.problem}`;
    case 'Unchecked':
      return 'Tunnel not checked yet';
    case 'Reachable':
      return 'Tunnel working';
    case 'Unreachable':
      return `Tunnel broken: ${status.problem}`;
  }
};

export { addressOf };
