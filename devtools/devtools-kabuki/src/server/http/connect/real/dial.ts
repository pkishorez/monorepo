import { Effect, Layer, Queue, Stream } from 'effect';
import { NetAddress } from 'effect/net';
import { RpcServer } from 'effect/rpc';
import { Socket, SocketServer } from 'effect/socket';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import {
  ServedRpcs,
  TabRpcs,
  serialization,
} from '../../../rpc/contract/index.ts';
import { DEFAULT_ENVIRONMENT, dialUrl } from '../contract/index.ts';
import { keep, nameFor, tabStorage } from './name.ts';

export interface TabOptions {
  readonly url?: string;
  readonly name?: string;
  readonly environment?: string;
}

export const DEVTOOLS_PATH = '/__devtools';

const MIN = 500;
const MAX = 10_000;

const pageOf = () => globalThis.location?.href ?? '';

const environmentOf = (given: string | undefined) =>
  given || globalThis.location?.host || DEFAULT_ENVIRONMENT;

const dialing = (
  url: () => string,
): Layer.Layer<SocketServer.SocketServer, never, Socket.WebSocketConstructor> =>
  Layer.effect(SocketServer.SocketServer)(
    Effect.gen(function* () {
      const construct = yield* Socket.WebSocketConstructor;
      const port = Number(new URL(url()).port);
      return SocketServer.SocketServer.of({
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
              yield* Effect.exit(handler(socket));
              if (opened) wait = MIN;
              yield* Effect.sleep(wait);
              if (!opened) wait = Math.min(wait * 2, MAX);
            }
          }),
      });
    }),
  );

const pagesOf = (app: AppRuntime) =>
  Stream.callback<string>(
    (queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const tell = () => void Queue.offerUnsafe(queue, pageOf());
          const soon = () => void setTimeout(tell, 0);
          tell();
          globalThis.addEventListener?.('popstate', tell);
          const unsubscribe = app.subscribe(soon);
          return () => {
            unsubscribe();
            globalThis.removeEventListener?.('popstate', tell);
          };
        }),
        (stop) => Effect.sync(stop),
      ),
    { bufferSize: 1, strategy: 'sliding' },
  ).pipe(Stream.changes);

export const dial = (app: AppRuntime, options: TabOptions) => {
  const kept = tabStorage();
  const environment = environmentOf(options.environment);
  let name = nameFor({
    app: app.name,
    page: pageOf(),
    given: options.name,
    kept,
  });
  keep(kept, app.name, name);
  const url = () =>
    dialUrl(options.url ?? DEVTOOLS_PATH, {
      name,
      url: pageOf(),
      app: app.name,
      environment,
    });
  const tab = TabRpcs.toLayer({
    named: (given) =>
      Effect.sync(() => {
        name = given.name;
      }),
    page: () => pagesOf(app),
  });
  return RpcServer.layer(ServedRpcs, { disableFatalDefects: true }).pipe(
    Layer.provide(tab),
    Layer.provide(RpcServer.layerProtocolSocketServer),
    Layer.provide([serialization, dialing(url)]),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
};
