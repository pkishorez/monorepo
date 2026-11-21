import {
  KEY_EXPIRED,
  KEY_PREFIX,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  PROTOCOL,
} from '../contracts/link/index.js';
import type { ConnectionStatus } from '../contracts/heartbeat/index.js';

/*
 * What a computer's tunnel answers a socket, as `ke-connect`'s server does
 * (connection/cli/.../server/server.ts): the Connection Key first, a socket
 * offering any other is taken and closed `KEY_EXPIRED`; then the path,
 * `/<plugin>/<sha256>/rpc`, any other failing as an unanswered upgrade
 * does; then the Release, a socket for one the Plugin does not run taken
 * and closed `PLUGIN_MISMATCH`, saying which it runs. Only then is it
 * passed to the Plugin, its subprotocol `ke-connect` selected.
 */

/** Where a computer's tunnel is reached while it stands as `status`: its host, or null while none is up there. */
export const hostOf = (status: ConnectionStatus): string | null =>
  status._tag === 'Ready' && status.check._tag !== 'Unreachable'
    ? new URL(status.url).host
    : null;

/** What a socket asked a tunnel for: the host it dialled, its path, and the key it offered. */
export interface Asked {
  readonly host: string;
  readonly path: string;
  readonly key: string | null;
}

/** What a socket at `url`, offering `protocols`, asks for; null for a URL no tunnel could be at. */
export const askedOf = (
  url: string,
  protocols: ReadonlyArray<string> | undefined,
): Asked | null => {
  if (!URL.canParse(url)) return null;
  const { host, pathname } = new URL(url);
  const offered = (protocols ?? []).find((each) => each.startsWith(KEY_PREFIX));
  return {
    host,
    path: pathname,
    key: offered === undefined ? null : offered.slice(KEY_PREFIX.length),
  };
};

/** How a tunnel answers a socket. */
export type Answer =
  /** Passed to the code Plugin, the subprotocol selected. */
  | { readonly _tag: 'Pass'; readonly protocol: string }
  /** Taken, then closed at once with `code` and `reason`. */
  | { readonly _tag: 'Close'; readonly code: number; readonly reason: string }
  /** Never taken: the upgrade was answered with a plain response. */
  | { readonly _tag: 'Refuse' };

/**
 * How a tunnel answers `asked`, on a computer whose Connection Key is `key`
 * and whose code Plugin runs `running`, null while it runs none.
 */
export const answerOf = (
  asked: Asked,
  computer: { readonly key: string; readonly running: string | null },
): Answer => {
  if (asked.key !== computer.key)
    return { _tag: 'Close', code: KEY_EXPIRED, reason: 'key expired' };
  const plugin = pluginOfPath(asked.path);
  if (plugin === null || plugin.name !== 'code') return { _tag: 'Refuse' };
  if (plugin.hash !== computer.running)
    return {
      _tag: 'Close',
      code: PLUGIN_MISMATCH,
      reason: mismatchReason(computer.running),
    };
  return { _tag: 'Pass', protocol: PROTOCOL };
};
