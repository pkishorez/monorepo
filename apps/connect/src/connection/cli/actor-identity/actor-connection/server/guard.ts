import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import {
  allowsOrigin,
  KEY_PREFIX,
} from '../../../../../connection/link/index.js';

/*
 * Who may come in. A browser page is let in only from an origin given; a
 * program sends no Origin and is let in. Then the Connection Key: a browser
 * can set no header on a WebSocket but `Sec-WebSocket-Protocol`, so a caller
 * offers the subprotocols `ke-connect` and `key.<key>`. Every request but
 * `/health`, spelled exactly, needs the key, read now, as it changes while the
 * Connection runs: a request without one gets 401, and any but the one held
 * has EXPIRED, as only one is kept, so an old key cannot be told from a
 * made-up one. The guard names what stays open rather than what is shut, so no
 * other spelling of a path (`/CODE/rpc`, `//code/rpc`, `/%63ode/rpc`) skips
 * it. A Plugin never sees the key: it is taken out of what the request offers,
 * and the Plugin selects `ke-connect`.
 */

/** The one path open without the key, for the Heartbeat's Tunnel Check. */
export const HEALTH = '/health';

/** Why a request is turned away, or null when it may come in. */
export interface Refusal {
  readonly status: number;
  readonly text: string;
}

/** A request offering any key but the one held; a WebSocket is told so by a close instead. */
export const EXPIRED: Refusal = {
  status: 401,
  text: 'That key has expired; ask Connect Cloud for this Connection’s key',
};

const offered = (header: string | ReadonlyArray<string> | undefined) =>
  (Array.isArray(header) ? header.join(',') : ((header as string) ?? ''))
    .split(',')
    .map((each) => each.trim())
    .filter((each) => each !== '');

const same = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** The path of a request target, without its query. */
export const pathOf = (url: string | undefined) => (url ?? '').split('?')[0];

/** A guard for the Connection Key `key` gives now, letting in pages from `origins`. */
export const guard = (key: () => string, origins: ReadonlyArray<string>) => {
  const allowed = allowsOrigin(origins);
  return (request: {
    readonly url?: string | undefined;
    readonly headers: IncomingHttpHeaders;
  }): Refusal | null => {
    const origin = request.headers['origin'];
    if (origin !== undefined && !allowed(origin))
      return { status: 403, text: 'This origin is not allowed' };
    if (pathOf(request.url) === HEALTH) return null;
    const keys = offered(request.headers['sec-websocket-protocol'])
      .filter((each) => each.startsWith(KEY_PREFIX))
      .map((each) => each.slice(KEY_PREFIX.length));
    if (keys.length === 0)
      return { status: 401, text: 'This Connection needs its key' };
    const held = key();
    return keys.some((each) => same(each, held)) ? null : EXPIRED;
  };
};

/** The subprotocols a request offers, without its key; undefined when none is left. */
export const withoutKey = (
  header: string | ReadonlyArray<string> | undefined,
) => {
  const left = offered(header).filter((each) => !each.startsWith(KEY_PREFIX));
  return left.length === 0 ? undefined : left.join(', ');
};
