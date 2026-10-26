import {
  addressOf,
  type Connection as ConnectionSchema,
  type ConnectionStatus,
} from '@kestack/connect/code';

type Connection = typeof ConnectionSchema.Type;

/*
 * What can be said of a Connection from its record alone: while its socket
 * is not up, why not; where its socket is, the Connections say
 * (`socketUrl`). A Connection reports itself on every Heartbeat, every 15
 * seconds; one whose Last Seen is older than three of them is down. One seen lately
 * says in its Connection Status how far its tunnel got: cloudflared
 * downloading, the tunnel opening or failed to open, or up and whether its
 * last check reached it. A record only as this device kept it is old by
 * nature, so it says nothing until it is checked: Cloud Connect answered,
 * its socket was up and dropped, or long enough passed (`Known.checked`);
 * until then the Connection is only linking.
 */

/** How often a Connection reports itself, and the list is asked again. */
export const HEARTBEAT = 15_000;

/** A Connection not seen for this long is down. */
export const DOWN_AFTER = 3 * HEARTBEAT;

/** The socket to the Connection now. */
export type Link = 'linking' | 'linked' | 'relinking';

/** Why a Connection's socket is not up, or that it is. */
export type Health =
  | { readonly _tag: 'Linked' }
  /** Not listed yet, or listed only as kept and not checked: nothing believed of it. */
  | { readonly _tag: 'Unknown' }
  /** Seen lately: its status says how far its tunnel got. */
  | {
      readonly _tag: 'Seen';
      readonly lastSeen: number;
      readonly status: ConnectionStatus;
    }
  /** Not seen for three Heartbeats. */
  | { readonly _tag: 'Down'; readonly lastSeen: number };

export const health = (
  connection: Connection | null,
  link: Link,
  now: number,
  /** Whether the record can be believed: see `Known.checked`. */
  checked: boolean,
): Health => {
  if (link === 'linked') return { _tag: 'Linked' };
  if (connection === null) return { _tag: 'Unknown' };
  // A socket up and dropped since is news; a kept record on its own is not.
  if (!checked && link === 'linking') return { _tag: 'Unknown' };
  const { lastSeen, status } = connection;
  if (now - lastSeen > DOWN_AFTER) return { _tag: 'Down', lastSeen };
  return { _tag: 'Seen', lastSeen, status };
};

/**
 * Whether a Connection is out of reach rather than on its way: down, or seen
 * with its tunnel not up. Unchecked and Reachable are a socket still
 * linking.
 */
export const outOfReach = (
  health: Health,
): health is Extract<Health, { readonly lastSeen: number }> =>
  health._tag === 'Down' ||
  (health._tag === 'Seen' &&
    health.status._tag !== 'Unchecked' &&
    health.status._tag !== 'Reachable');

/** The Connection Status as Settings says it. */
export const statusOf = (status: ConnectionStatus) => {
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
