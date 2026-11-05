import {
  addressOf,
  type Connection as ConnectionSchema,
  type ConnectionStatus,
  isOutdated,
} from '@kestack/connect/cloud';
import { elapsed, size } from '../../../../../ui/labels/status/index.ts';
import type { Behind } from '../reach/index.ts';

type Connection = typeof ConnectionSchema.Type;

/*
 * What can be said of a Connection from its record alone: while its socket
 * is not up, why not; where its socket is, the Connections say
 * (`tunnelOf`). A Connection reports itself on every Heartbeat, every 15
 * seconds; one whose Last Seen is older than three of them is down. One seen lately
 * says in its Connection Status how far its tunnel got: setting up, with
 * cloudflared downloading, the tunnel opening or failed to open; or ready at
 * its address, and whether its last check reached it. It also says the version of `ke-connect` it runs,
 * which the app asks to update once it is Outdated, older than Connect Cloud accepts. A record only as this device kept it is old by
 * nature, so it says nothing until it is checked: Connect Cloud answered,
 * or long enough passed (`Known.checked`); until then the Connection is
 * only linking, its socket on its way or relinking, as it is when the page
 * comes back after a while hidden.
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
  // A record not checked is old news, whatever the socket does.
  if (!checked) return { _tag: 'Unknown' };
  const { lastSeen, status } = connection;
  if (now - lastSeen > DOWN_AFTER) return { _tag: 'Down', lastSeen };
  return { _tag: 'Seen', lastSeen, status };
};

/**
 * Whether a Connection is out of reach rather than on its way: down, or seen
 * with its tunnel not up. A tunnel Ready, Unchecked or Reachable, is a socket
 * still linking.
 */
export const outOfReach = (
  health: Health,
): health is Extract<Health, { readonly lastSeen: number }> =>
  health._tag === 'Down' ||
  (health._tag === 'Seen' &&
    (health.status._tag === 'SettingUp' ||
      health.status.check._tag === 'Unreachable'));

/**
 * cloudflared on its way, how much has arrived and for how long: only the time
 * until any has, as for a Connection waiting on another's download.
 */
export const downloadingOf = ({
  elapsed: ms,
  received,
}: {
  readonly elapsed: number;
  readonly received: number;
}) =>
  `Downloading cloudflared · ${received > 0 ? `${size(received)}, ` : ''}${elapsed(ms)}`;

/** The Connection Status as Settings says it. */
export const statusOf = (status: ConnectionStatus) => {
  if (status._tag === 'SettingUp') {
    const { step } = status;
    switch (step._tag) {
      case 'Downloading':
        return downloadingOf(step);
      case 'Opening':
        return 'Opening its tunnel';
      case 'Failed':
        return `Tunnel failed to open: ${step.problem}`;
    }
  }
  const { check } = status;
  switch (check._tag) {
    case 'Unchecked':
      return 'Tunnel not checked yet';
    case 'Reachable':
      return 'Tunnel working';
    case 'Unreachable':
      return `Tunnel broken: ${check.problem}`;
  }
};

/**
 * How the code Plugin stands when the app should say so, as Connect Cloud said
 * once the Connection closed a socket running another Release: Updating, while
 * Connect is catching up with this Code, or Stale, when this Code is the older
 * side, which is moving to its newest build.
 */
export type PluginNotice =
  | { readonly _tag: 'Updating' }
  | { readonly _tag: 'Stale' };

/** What the app says of the code Plugin, given who is behind; null while nobody is. */
export const pluginNotice = (behind: Behind | null): PluginNotice | null =>
  behind === null ? null : { _tag: behind };

/** How `ke-connect` is updated on a computer. */
export const UPDATE_COMMAND = 'npm i -g @kestack/connect@latest';

/** Whether the Connection is Outdated: its `ke-connect` is older than Connect Cloud accepts, the Minimum Connect. */
export const outdated = (connection: Connection | null) =>
  connection !== null && isOutdated(connection);

export { addressOf };
