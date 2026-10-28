import { Effect, Layer } from 'effect';
import { NetAddress } from 'effect/net';
import { RpcServer } from 'effect/rpc';
import type { Rpc, RpcGroup } from 'effect/rpc';
import { Socket, SocketServer } from 'effect/socket';
import {
  CONNECT_PATH,
  KabukiSessionApi,
  serialization,
} from '../../api/index.ts';
import type { Dialed } from '../../api/index.ts';

/*
 * The socket: the app dials DevTools and serves the Kabuki Session Api
 * over what it dialed. Effect's RPC server takes its sockets from a
 * SocketServer; this one accepts nothing, it dials.
 *
 * 1. Dial    `/kabuki/connect` on the DevTools Server, or under the path
 *            it is proxied at on the page's origin, the query saying
 *            who asks, read again at every dial: a name DevTools gave
 *            since is the one dialed next.
 * 2. Redial  after the socket closes or never opens: soon at first, then
 *            each time twice as long, up to MAX; soon again once one
 *            opened. Quietly: nothing reaches the app.
 * 3. Serve   the Api, over each socket in turn, with Effect's framing.
 */

type Handlers = Rpc.ToHandler<RpcGroup.Rpcs<typeof KabukiSessionApi>>;

/** How long, in milliseconds, before dialing again: at first, and at most. */
const MIN = 500;
const MAX = 10_000;

// 1. Dial
/**
 * The DevTools Server's `/kabuki/connect`, asked as `dialed`, over `ws:` or
 * `wss:`. A `server` that is a path, `/__devtools`, is on the page's own
 * origin, and its path is kept before `/kabuki/connect`.
 */
export const dialUrl = (server: string, dialed: Dialed): string => {
  const base = URL.canParse(server)
    ? new URL(server)
    : new URL(server, dialed.url);
  const url = new URL(base.pathname.replace(/\/$/, '') + CONNECT_PATH, base);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  url.searchParams.set('name', dialed.name);
  url.searchParams.set('url', dialed.url);
  url.searchParams.set('app', dialed.app);
  url.searchParams.set('environment', dialed.environment);
  return url.toString();
};

// 2. Redial
/** A SocketServer whose `run` hands its handler one dialed socket at a time, for as long as it runs. */
export const dialing = (
  url: () => string,
): Layer.Layer<SocketServer.SocketServer, never, Socket.WebSocketConstructor> =>
  Layer.effect(SocketServer.SocketServer)(
    Effect.gen(function* () {
      const construct = yield* Socket.WebSocketConstructor;
      const port = Number(new URL(url()).port);
      return SocketServer.SocketServer.of({
        // It listens nowhere: the address is the local DevTools Server it dials.
        address: NetAddress.inetAddressUnsafe(
          NetAddress.loopbackAddresses[0],
          Number.isInteger(port) ? port : 0,
        ),
        run: (handler) =>
          Effect.gen(function* () {
            let wait = MIN;
            while (true) {
              let opened = false;
              const dialed = yield* Socket.makeWebSocket(Effect.sync(url), {
                openTimeout: '5 seconds',
              }).pipe(
                Effect.provideService(Socket.WebSocketConstructor, construct),
              );
              const socket = Socket.make({
                reader: dialed.reader.pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      opened = true;
                    }),
                  ),
                ),
                writer: dialed.writer,
              });
              // However it ended, closed or never open, it is dialed again.
              yield* Effect.exit(handler(socket));
              if (opened) wait = MIN;
              yield* Effect.sleep(wait);
              if (!opened) wait = Math.min(wait * 2, MAX);
            }
          }),
      });
    }),
  );

// 3. Serve
/** The Api answered by `handlers` over every socket `url` dials, until the Layer goes. */
export const served = (
  handlers: Layer.Layer<Handlers>,
  url: () => string,
): Layer.Layer<never> =>
  // A defect fails only the call it was in, not every call DevTools has open.
  RpcServer.layer(KabukiSessionApi, { disableFatalDefects: true }).pipe(
    Layer.provide(handlers),
    Layer.provide(RpcServer.layerProtocolSocketServer),
    Layer.provide([serialization, dialing(url)]),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
