import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { allowsOrigin } from '@kestack/connect-cloud/app';
import {
  HEALTH,
  KEY_HEADER,
  KEY_PREFIX,
} from '../../../http/link/contract/index.js';

export interface Refusal {
  readonly status: number;
  readonly text: string;
}

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

export const pathOf = (url: string | undefined) => (url ?? '').split('?')[0];

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
    const keys = [
      ...offered(request.headers['sec-websocket-protocol'])
        .filter((each) => each.startsWith(KEY_PREFIX))
        .map((each) => each.slice(KEY_PREFIX.length)),
      ...offered(request.headers[KEY_HEADER]),
    ];
    if (keys.length === 0)
      return { status: 401, text: 'This Connection needs its key' };
    const held = key();
    return keys.some((each) => same(each, held)) ? null : EXPIRED;
  };
};

export const corsOf = (
  origins: ReadonlyArray<string>,
): ((origin: string | undefined) => Record<string, string>) => {
  const allowed = allowsOrigin(origins);
  return (origin) =>
    origin === undefined || !allowed(origin)
      ? { vary: 'Origin' }
      : {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': `content-type, ${KEY_HEADER}`,
          'access-control-max-age': '600',
          vary: 'Origin',
        };
};

export const withoutKey = (
  header: string | ReadonlyArray<string> | undefined,
) => {
  const left = offered(header).filter((each) => !each.startsWith(KEY_PREFIX));
  return left.length === 0 ? undefined : left.join(', ');
};
