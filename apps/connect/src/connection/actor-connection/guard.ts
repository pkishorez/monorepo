import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { allowsOrigin } from '../../cloud/contract/index.js';

/*
 * Who may come in. A browser page is let in only from an origin given; a
 * program sends no Origin and is let in. Then the Connection Key (ADR
 * 0015): a browser can set no header on a WebSocket but
 * `Sec-WebSocket-Protocol`, so a caller offers the subprotocols
 * `ke-connect` and `key.<key>`. Every request but `/health`, spelled
 * exactly, needs the key: a request without it gets 401, with the wrong one
 * 403. The guard names what stays open rather than what is shut, so no
 * other spelling of a path (`/CODE/rpc`, `//code/rpc`, `/%63ode/rpc`)
 * skips it. A Plugin never sees the key: it is taken out of what the
 * request offers, and the Plugin selects `ke-connect`.
 */

/** The one path open without the key, for the Heartbeat's Tunnel Check. */
export const HEALTH = '/health';

const KEY = 'key.';

/** Why a request is turned away, or null when it may come in. */
export interface Refusal {
  readonly status: number;
  readonly text: string;
}

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

/** A guard for the Connection Key `key`, letting in pages from `origins`. */
export const guard = (key: string, origins: ReadonlyArray<string>) => {
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
      .filter((each) => each.startsWith(KEY))
      .map((each) => each.slice(KEY.length));
    if (keys.length === 0)
      return { status: 401, text: 'This Connection needs its key' };
    return keys.some((each) => same(each, key))
      ? null
      : { status: 403, text: 'That is not this Connection’s key' };
  };
};

/** The subprotocols a request offers, without its key; undefined when none is left. */
export const withoutKey = (
  header: string | ReadonlyArray<string> | undefined,
) => {
  const left = offered(header).filter((each) => !each.startsWith(KEY));
  return left.length === 0 ? undefined : left.join(', ');
};
