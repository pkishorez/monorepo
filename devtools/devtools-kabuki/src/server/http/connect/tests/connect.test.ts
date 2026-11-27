import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Effect, Exit, Layer, Option, Queue, Scope, Stream } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Socket } from 'effect/socket';
import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../../../../app.tsx';
import { started } from '../../../../services/kabuki-session/tests/diary.ts';
import {
  CONNECT_PATH,
  ServedRpcs,
  serialization,
} from '../../../rpc/contract/index.ts';
import type { TabClient } from '../../../rpc/contract/index.ts';
import { DEFAULT_ENVIRONMENT, dialUrl, dialedOf } from '../contract/index.ts';
import { DEVTOOLS_PATH } from '../real/dial.ts';

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
  readonly client: TabClient;
}

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
          const client = yield* RpcClient.make(ServedRpcs).pipe(
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
    'dials DevTools under a name, answers its calls, and dials again under the name DevTools gave',
    () =>
      run(
        Effect.gen(function* () {
          const port = yield* Effect.promise(freePort);
          const { app, write } = yield* started;
          write('first', 5);
          const stop = connect({
            url: `ws://127.0.0.1:${port}`,
            name: 'diary',
            environment: 'kishores-mbp',
          })(app);
          yield* Effect.addFinalizer(() => Effect.sync(stop));
          const accepted = yield* Queue.unbounded<Accepted>();

          yield* Effect.sleep('700 millis');
          const first = yield* Scope.make();
          yield* devtools(port, accepted).pipe(Scope.provide(first));
          const one = yield* Queue.take(accepted);
          expect(one.query.get('name')).toBe('diary');
          expect(one.query.get('app')).toBe('Diary');
          expect(one.query.get('environment')).toBe('kishores-mbp');
          yield* one.client.named({ name: 'diary-2' });
          const told = yield* one.client.history({}).pipe(Stream.runHead);
          expect(Option.getOrThrow(told).entries).toHaveLength(1);

          yield* Scope.close(first, Exit.void);
          const second = yield* Scope.make();
          yield* devtools(port, accepted).pipe(Scope.provide(second));
          const two = yield* Queue.take(accepted);
          expect(two.query.get('name')).toBe('diary-2');
          const { model } = yield* two.client.look({ address: 'Diary' });
          expect(model).toEqual({
            notes: [{ at: new Date(5).toISOString(), text: 'first' }],
          });
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
        const port = yield* Effect.promise(freePort);
        const accepted = yield* Queue.unbounded<Accepted>();
        yield* devtools(port, accepted);
        const { app } = yield* started;
        const stop = connect({ url: `ws://127.0.0.1:${port}` })(app);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        const one = yield* Queue.take(accepted);
        expect(one.query.get('name')).toBe('diary');
        expect(one.query.get('environment')).toBe(DEFAULT_ENVIRONMENT);
        yield* one.client.named({ name: 'diary-2' });
        expect(kept.get('@kestack/devtools-kabuki:Diary:name')).toBe('diary');
      }),
    ));

  it("in a browser, dials with the page's host as its Environment, unless given one, and tells the page it is on", () =>
    run(
      Effect.gen(function* () {
        vi.stubGlobal('location', {
          href: 'https://app.trycloudflare.com/notes',
          host: 'app.trycloudflare.com',
        });
        const port = yield* Effect.promise(freePort);
        const accepted = yield* Queue.unbounded<Accepted>();
        yield* devtools(port, accepted);
        const { app } = yield* started;
        const page = connect({ url: `ws://127.0.0.1:${port}` })(app);
        yield* Effect.addFinalizer(() => Effect.sync(page));
        const one = yield* Queue.take(accepted);
        expect(one.query.get('environment')).toBe('app.trycloudflare.com');
        expect(
          Option.getOrThrow(yield* one.client.page().pipe(Stream.runHead)),
        ).toBe('https://app.trycloudflare.com/notes');
        const given = connect({
          url: `ws://127.0.0.1:${port}`,
          environment: 'staging',
        })(app);
        yield* Effect.addFinalizer(() => Effect.sync(given));
        expect((yield* Queue.take(accepted)).query.get('environment')).toBe(
          'staging',
        );
      }),
    ));

  it('answers without a FakeWorld when its loader fails, and says so once', () =>
    run(
      Effect.gen(function* () {
        const said = vi.spyOn(console, 'error').mockImplementation(() => {});
        yield* Effect.addFinalizer(() => Effect.sync(() => said.mockRestore()));
        const port = yield* Effect.promise(freePort);
        const accepted = yield* Queue.unbounded<Accepted>();
        yield* devtools(port, accepted);
        const { app } = yield* started;
        const stop = connect({
          url: `ws://127.0.0.1:${port}`,
          world: () => Promise.reject(new Error('no world here')),
        })(app);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        const one = yield* Queue.take(accepted);
        expect(
          Option.getOrThrow(yield* one.client.world().pipe(Stream.runHead)),
        ).toEqual([]);
        expect(said).toHaveBeenCalledTimes(1);
        expect(said.mock.calls[0]![1]).toMatchObject({
          message: 'no world here',
        });
      }),
    ));

  it('never throws into the app where there are no sockets', () => {
    vi.stubGlobal('WebSocket', undefined);
    return run(
      Effect.gen(function* () {
        const { app } = yield* started;
        const stop = connect()(app);
        expect(stop).toBeTypeOf('function');
        expect(() => stop()).not.toThrow();
      }),
    );
  });
});

describe('the query a Kabuki Session dials with', () => {
  it('dials /kabuki/connect with who asks, over ws for an http URL, and reads back the same', () => {
    const dialed = {
      name: 'quiet-otter',
      url: 'http://localhost:5173/?a=1',
      app: 'Diary',
      environment: 'localhost:5173',
    };
    const url = new URL(dialUrl('http://127.0.0.1:14400', dialed));
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe(CONNECT_PATH);
    expect(Object.fromEntries(url.searchParams)).toEqual(dialed);
    expect(dialedOf(`${url.pathname}${url.search}`)).toEqual(dialed);
  });

  it('reads a query that says little: the app as its name, the default Environment', () => {
    expect(dialedOf(`${CONNECT_PATH}?app=Diary`)).toEqual({
      name: 'Diary',
      url: '',
      app: 'Diary',
      environment: DEFAULT_ENVIRONMENT,
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

afterEach(() => {
  vi.unstubAllGlobals();
});
