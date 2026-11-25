import { pluginOfPath, PROTOCOL } from '../contracts/link/index.js';
import type { ConnectionStatus } from '../contracts/heartbeat/index.js';

/*
 * What a computer's tunnel answers a socket, as `ke-connect`'s server does
 * (connection/cli/.../server/server.ts) on the happy path: the path,
 * `/<plugin>/<sha256>/rpc`, any other failing as an unanswered upgrade
 * does. Only then is it passed to the Plugin, its subprotocol `ke-connect`
 * selected. A computer in a tab keeps one Connection Key and runs the
 * App's own Release, so a socket never offers another of either.
 */

/** Where a computer's tunnel is reached while it stands as `status`: its host, or null while none is up there. */
export const hostOf = (status: ConnectionStatus): string | null =>
  status._tag === 'Ready' && status.check._tag !== 'Unreachable'
    ? new URL(status.url).host
    : null;

/** What a socket asked a tunnel for: the host it dialled, and its path. */
export interface Asked {
  readonly host: string;
  readonly path: string;
}

/** What a socket at `url` asks for; null for a URL no tunnel could be at. */
export const askedOf = (url: string): Asked | null => {
  if (!URL.canParse(url)) return null;
  const { host, pathname } = new URL(url);
  return { host, path: pathname };
};

/** How a tunnel answers a socket. */
export type Answer =
  /** Passed to the code Plugin, the subprotocol selected. */
  | { readonly _tag: 'Pass'; readonly protocol: string }
  /** Never taken: the upgrade was answered with a plain response. */
  | { readonly _tag: 'Refuse' };

/** How a tunnel answers `asked`. */
export const answerOf = (asked: Asked): Answer => {
  const plugin = pluginOfPath(asked.path);
  if (plugin === null || plugin.name !== 'code') return { _tag: 'Refuse' };
  return { _tag: 'Pass', protocol: PROTOCOL };
};
