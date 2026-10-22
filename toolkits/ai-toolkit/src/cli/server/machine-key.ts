import { timingSafeEqual } from 'node:crypto';
import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

/*
 * The Machine Key at the door (ADR 0015). A browser can set no header on a
 * WebSocket but `Sec-WebSocket-Protocol`, so a caller offers the
 * subprotocols `ai-toolkit` and `key.<key>`. A socket to `/rpc` without the
 * key gets 401, with the wrong one 403, before it is upgraded. The server
 * then answers with `ai-toolkit` alone, never the key: a browser drops a
 * socket whose server selects no subprotocol it offered.
 */

/** The subprotocol the server selects. */
export const PROTOCOL = 'ai-toolkit';

const PREFIX = 'key.';

const offered = (header: string | undefined) =>
  (header ?? '')
    .split(',')
    .map((each) => each.trim())
    .filter((each) => each !== '');

const same = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const refuse = (status: number, text: string) =>
  Effect.succeed(HttpServerResponse.text(text, { status }));

/** Turns away a request to `/rpc` that does not carry `key`. */
export const keyGuard = (key: string) =>
  HttpRouter.middleware(
    (app) =>
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
        const path = request.url.split('?')[0];
        if (path !== '/rpc' && !path?.startsWith('/rpc/')) return app;
        const keys = offered(request.headers['sec-websocket-protocol'])
          .filter((each) => each.startsWith(PREFIX))
          .map((each) => each.slice(PREFIX.length));
        if (keys.length === 0) return refuse(401, 'This Machine needs its key');
        return keys.some((each) => same(each, key))
          ? app
          : refuse(403, 'That is not this Machine’s key');
      }),
    { global: true },
  );

/** Which offered subprotocol the WebSocket server selects: `ai-toolkit`, never a key. */
export const selectProtocol = (protocols: Set<string>): string | false =>
  protocols.has(PROTOCOL) ? PROTOCOL : false;
