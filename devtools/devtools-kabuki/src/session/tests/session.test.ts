import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Effect, Exit, Layer, Option, Queue, Scope } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Socket } from 'effect/socket';
import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer';
import { describe, expect, it, vi } from 'vitest';
import {
  CONNECT_PATH,
  DEFAULT_ENVIRONMENT,
  KabukiSessionApi,
  serialization,
} from '../../api/index.ts';
import type { KabukiSessionClient } from '../../api/index.ts';
import { DEVTOOLS_PATH, connect } from '../index.ts';
import { dialUrl } from '../socket/index.ts';
import { started } from './app.ts';

/*
 * A Kabuki Session over a real socket: a stand-in DevTools Server accepts
 * what the app dials and is the Api's client over it, the connection
 * reversed.
 */

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });

interface Accepted {
  readonly query: URLSearchParams;
  readonly client: KabukiSessionClient;
}

/** DevTools on `port` until the Scope closes: each Kabuki Session it accepts, an Api client over its socket. */
const devtools = (port: number, accepted: Queue.Queue<Accepted>) =>
  Effect.gen(function* () {
    const server = yield* NodeSocketServer.makeWebSocket({
      host: '127.0.0.1',
      port,
      path: CONNECT_PATH,
    });
    yield* server
      .run((socket) =>
        Effect.gen(function* () {
          // The server hands each socket its upgrade request.
          const request = yield* Effect.serviceOption(
            NodeSocketServer.IncomingMessage,
          );
          const query = new URL(
            Option.match(request, {
              onNone: () => '',
              onSome: ({ url }) => url ?? '',
            }),
            'http://devtools',
          ).searchParams;
          const protocol = yield* Layer.build(
            RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
              Layer.provide(Layer.succeed(Socket.Socket)(socket)),
              Layer.provide(serialization),
            ),
          );
          const client = yield* RpcClient.make(KabukiSessionApi).pipe(
            Effect.provideContext(protocol),
          );
          yield* Queue.offer(accepted, { query, client });
          yield* Effect.never;
        }).pipe(Effect.scoped),
      )
      .pipe(Effect.forkScoped);
  });

describe('connect', () => {
  it(
    'dials DevTools under a name, answers it, and dials again under the name DevTools gave',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const { runtime, write } = yield* started;
          write('first', 5);
          const stop = connect({
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
            environment: 'kishores-mbp',
          })(runtime);
          yield* Effect.addFinalizer(() => Effect.sync(stop));
          const accepted = yield* Queue.unbounded<Accepted>();

          // DevTools is not up yet: the app keeps dialing, quietly.
          yield* Effect.sleep('700 millis');
          const first = yield* Scope.make();
          yield* devtools(port, accepted).pipe(Scope.provide(first));
          const one = yield* Queue.take(accepted);
          expect(one.query.get('name')).toBe('diary');
          expect(one.query.get('app')).toBe('Diary');
          expect(one.query.get('environment')).toBe('kishores-mbp');
          yield* one.client.named({ name: 'diary-2' });
          expect(yield* one.client.info()).toMatchObject({
            app: 'Diary',
            name: 'diary-2',
          });
          expect((yield* one.client.history({})).entries).toHaveLength(1);

          // DevTools restarts: the app dials again, as the name it was given.
          yield* Scope.close(first, Exit.void);
          const second = yield* Scope.make();
          yield* devtools(port, accepted).pipe(Scope.provide(second));
          const two = yield* Queue.take(accepted);
          expect(two.query.get('name')).toBe('diary-2');
          expect(
            (yield* two.client.snapshot({ path: 'model.notes.0.text' })).value,
          ).toBe('first');
          yield* Scope.close(second, Exit.void);
        }),
      ),
    20_000,
  );

  it('keeps the name it asked for, not one DevTools answered on a clash', () =>
    run(
      Effect.gen(function* () {
        const kept = new Map([
          ['@kestack/devtools-kabuki:Diary:name', 'diary'],
        ]);
        vi.stubGlobal('sessionStorage', {
          getItem: (key: string) => kept.get(key) ?? null,
          setItem: (key: string, value: string) => void kept.set(key, value),
        });
        yield* Effect.addFinalizer(() => Effect.sync(vi.unstubAllGlobals));
        const port = yield* Effect.promise(freePort);
        const accepted = yield* Queue.unbounded<Accepted>();
        yield* devtools(port, accepted);
        const { runtime } = yield* started;
        const stop = connect(runtime, { url: `ws://127.0.0.1:${port}` });
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        const one = yield* Queue.take(accepted);
        expect(one.query.get('name')).toBe('diary');
        // No page and none given: the default Environment.
        expect(one.query.get('environment')).toBe(DEFAULT_ENVIRONMENT);
        yield* one.client.named({ name: 'diary-2' });
        expect(yield* one.client.info()).toMatchObject({ name: 'diary-2' });
        expect(kept.get('@kestack/devtools-kabuki:Diary:name')).toBe('diary');
      }),
    ));

  it("in a browser, dials with the page's host as its Environment, unless given one", () =>
    run(
      Effect.gen(function* () {
        vi.stubGlobal('location', {
          href: 'https://app.trycloudflare.com/notes',
          host: 'app.trycloudflare.com',
        });
        yield* Effect.addFinalizer(() => Effect.sync(vi.unstubAllGlobals));
        const port = yield* Effect.promise(freePort);
        const accepted = yield* Queue.unbounded<Accepted>();
        yield* devtools(port, accepted);
        const { runtime } = yield* started;
        const page = connect(runtime, { url: `ws://127.0.0.1:${port}` });
        yield* Effect.addFinalizer(() => Effect.sync(page));
        expect((yield* Queue.take(accepted)).query.get('environment')).toBe(
          'app.trycloudflare.com',
        );
        const given = connect(runtime, {
          url: `ws://127.0.0.1:${port}`,
          environment: 'staging',
        });
        yield* Effect.addFinalizer(() => Effect.sync(given));
        expect((yield* Queue.take(accepted)).query.get('environment')).toBe(
          'staging',
        );
      }),
    ));

  it('dials /kabuki/connect with who asks, over ws for an http URL', () => {
    const url = new URL(
      dialUrl('http://127.0.0.1:14400', {
        name: 'quiet-otter',
        url: 'http://localhost:5173/?a=1',
        app: 'Diary',
        environment: 'localhost:5173',
      }),
    );
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe(CONNECT_PATH);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: 'quiet-otter',
      url: 'http://localhost:5173/?a=1',
      app: 'Diary',
      environment: 'localhost:5173',
    });
  });

  it("dials /__devtools on the page's origin by default, over wss for an https page", () => {
    const url = new URL(
      dialUrl(DEVTOOLS_PATH, {
        name: 'quiet-otter',
        url: 'https://app.trycloudflare.com/notes',
        app: 'Diary',
        environment: 'localhost:5173',
      }),
    );
    expect(url.origin).toBe('wss://app.trycloudflare.com');
    expect(url.pathname).toBe(`/__devtools${CONNECT_PATH}`);
  });

  it("keeps a whole URL's own path before /kabuki/connect", () => {
    const url = new URL(
      dialUrl('https://devtools.example.com/team/', {
        name: 'quiet-otter',
        url: 'http://localhost:5173/',
        app: 'Diary',
        environment: 'localhost:5173',
      }),
    );
    expect(url.origin).toBe('wss://devtools.example.com');
    expect(url.pathname).toBe(`/team${CONNECT_PATH}`);
  });
});
