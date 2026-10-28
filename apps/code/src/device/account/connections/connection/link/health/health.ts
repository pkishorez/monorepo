import {
  addressOf,
  type Connection as ConnectionSchema,
  type ConnectionStatus,
} from '@kestack/connect/cloud';

type Connection = typeof ConnectionSchema.Type;

/*
 * What can be said of a Connection from its record alone: while its socket
 * is not up, why not; where its socket is, the Connections say
 * (`socketUrl`). A Connection reports itself on every Heartbeat, every 15
 * seconds; one whose Last Seen is older than three of them is down. One seen lately
 * says in its Connection Status how far its tunnel got: cloudflared
 * downloading, the tunnel opening or failed to open, or up and whether its
 * last check reached it. It also says where its code Plugin stands, which
 * the app shows while it is Updating or Crashed, linked or not; and the
 * version of `ke-connect` it runs, which the app asks to update once Cloud
 * Connect says a newer one is out. A record only as this device kept it is old by
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

/** The Plugin Code talks to. */
const CODE = 'code';

/**
 * How the code Plugin stands when the app should say so: Updating while a
 * new version downloads (how far, when known) or starts, or Crashed with
 * its last lines and when it is tried again.
 */
export type PluginNotice =
  | {
      readonly _tag: 'Updating';
      /** Bytes received and the total, while it downloads; null once it starts. */
      readonly progress: {
        readonly received: number;
        readonly total: number | null;
      } | null;
    }
  | {
      readonly _tag: 'Crashed';
      readonly log: ReadonlyArray<string>;
      readonly retryAt: number;
    };

/** How the code Plugin stands, while it is not simply running; null too while the Connection is down, its report stale. */
export const pluginNotice = (
  connection: Connection | null,
  now: number,
): PluginNotice | null => {
  if (connection === null || now - connection.lastSeen > DOWN_AFTER)
    return null;
  const state = connection.plugins[CODE];
  switch (state?._tag) {
    case 'Downloading':
      return {
        _tag: 'Updating',
        progress: { received: state.received, total: state.total },
      };
    case 'Starting':
      return { _tag: 'Updating', progress: null };
    case 'Crashed':
      return { _tag: 'Crashed', log: state.log, retryAt: state.retryAt };
    default:
      return null;
  }
};

/** How `ke-connect` is updated on a computer. */
export const UPDATE_COMMAND = 'npm i -g @kestack/connect@latest';

/** A version's numbers, and whether it is a pre-release. */
const partsOf = (version: string) => {
  const [core = '', pre] = version.trim().replace(/^v/, '').split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre !== undefined,
  };
};

/** Whether `version` is older than `than`, as semver orders them. */
export const olderThan = (version: string, than: string) => {
  const a = partsOf(version);
  const b = partsOf(than);
  for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i++) {
    const x = a.numbers[i] ?? 0;
    const y = b.numbers[i] ?? 0;
    if (x !== y) return x < y;
  }
  return a.pre && !b.pre;
};

/** The `ke-connect` the Connection should update to, the Minimum Connect; null when it runs one as new, or none is known. */
export const updateOf = (connection: Connection | null): string | null =>
  connection?.minConnect != null &&
  olderThan(connection.version, connection.minConnect)
    ? connection.minConnect
    : null;

export { addressOf };
