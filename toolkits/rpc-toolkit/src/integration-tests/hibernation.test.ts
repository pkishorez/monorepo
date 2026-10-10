import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { Rpc as EffectRpc, RpcGroup } from 'effect/rpc';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { Rpc } from '../rpc/index.ts';
import { accept, socket, stores, watch, type TestSocket } from './harness.ts';

class Forbidden extends Schema.Error<Forbidden>('replay/Forbidden')({
  _tag: Schema.tag('Forbidden'),
}) {}
const Access = Rpc.middleware<boolean>()('replay/Access', {
  error: Forbidden,
});
const Group = Access.with(true)(
  RpcGroup.make(
    EffectRpc.make('watch', { success: Schema.Number, stream: true }),
  ),
);
const Plain = RpcGroup.make(
  EffectRpc.make('watch', { success: Schema.Number, stream: true }),
);
const Identity = Context.Reference<string>('replay/Identity', {
  defaultValue: () => 'anonymous',
});

afterEach(() => vi.unstubAllGlobals());

const send = (
  server: {
    message: (s: Rpc.HibernatingSocket, d: string) => Effect.Effect<void>;
  },
  target: TestSocket,
  data: string,
) => Effect.runPromise(server.message(target.port, data));

describe.each(stores)('with the $name Stream Store', ({ make }) => {
  /** Boots a server instance: `live` are the sockets that survived hibernation. */
  const booter =
    <L extends Layer.Layer<any, any, never>>(
      store: () => Rpc.StreamStore,
      group: typeof Plain | typeof Group,
      handlers: L,
      connection?: Rpc.ConnectionSlot<string>,
    ) =>
    (live: TestSocket[], next?: TestSocket) =>
      Effect.runPromise(
        Rpc.websocket.server(group as typeof Plain, handlers as never, {
          state: {
            getWebSockets: () => Effect.succeed(live.map(({ port }) => port)),
            setWebSocketAutoResponse: () => Effect.void,
          },
          upgrade: () =>
            Effect.succeed([
              HttpServerResponse.empty(),
              (next ?? live[0])!.port,
            ] as const),
          connection,
          streams: store(),
        }),
      );

  it('replays every in-flight stream without requiring a checkpoint', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store } = make();
    let starts = 0;
    const boot = booter(
      store,
      Plain,
      Plain.toLayer({
        watch: () =>
          Stream.unwrap(
            Effect.sync(() => {
              starts++;
              return Stream.never;
            }),
          ),
      }),
    );

    const first = socket();
    const firstServer = await boot([], first);
    await accept(firstServer);
    await send(firstServer, first, watch('0'));
    await vi.waitFor(() => expect(starts).toBe(1));

    const resumed = first.hibernate();
    await boot([resumed]);
    await vi.waitFor(() => expect(starts).toBe(2));
    expect(resumed.closed).toEqual([]);
  });

  it('serves a socket handed back in a fresh wrapper, as each workerd callback does', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store } = make();
    let starts = 0;
    const boot = booter(
      store,
      Plain,
      Plain.toLayer({
        watch: () =>
          Stream.unwrap(
            Effect.sync(() => {
              starts++;
              return Stream.never;
            }),
          ),
      }),
    );
    const first = socket();
    const server = await boot([], first);
    await accept(server);
    // The same WebSocket, wrapped anew.
    const again = { ...first, port: { ...first.port } };
    await send(server, again, watch('0'));
    await vi.waitFor(() => expect(starts).toBe(1));
    expect(first.closed).toEqual([]);
  });

  it('restores a stream before processing the close event that woke the object', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store } = make();
    const events: string[] = [];
    const boot = booter(
      store,
      Plain,
      Plain.toLayer({
        watch: () =>
          Stream.unwrap(
            Effect.sync(() => {
              events.push('start');
              return Stream.never.pipe(
                Stream.ensuring(Effect.sync(() => events.push('stop'))),
              );
            }),
          ),
      }),
    );
    const first = socket();
    const firstServer = await boot([], first);
    await accept(firstServer);
    await send(firstServer, first, watch('close-race'));
    await vi.waitFor(() => expect(events).toEqual(['start']));

    const resumed = first.hibernate();
    const server = await boot([resumed]);
    await Effect.runPromise(server.close(resumed.port, 1000, 'closed'));
    await vi.waitFor(() => expect(events).toEqual(['start', 'start', 'stop']));
  });

  it('rechecks authorization on replay, resumes from the checkpoint, and never trusts a client replay header', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store } = make();
    let allowed = true;
    let admissions = 0;
    const calls: Array<{
      kind: string;
      identity: string;
      token: string | undefined;
    }> = [];
    const cursors: number[] = [];
    const middleware = Access.layer(({ headers }) =>
      Effect.gen(function* () {
        const kind = yield* Rpc.websocket.InvocationKind;
        calls.push({
          kind,
          identity: yield* Identity,
          token: headers.authorization,
        });
        if (!allowed) return yield* new Forbidden();
        if (kind === 'fresh') admissions++;
      }),
    );
    const handlers = Group.toLayer({
      watch: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const checkpoint = yield* Rpc.websocket.checkpoint(
              Schema.NumberFromString,
            );
            expectTypeOf(checkpoint.put).parameter(0).toEqualTypeOf<number>();
            const cursor = Option.getOrElse(
              yield* checkpoint.get().pipe(Effect.orDie),
              () => 0,
            );
            cursors.push(cursor);
            yield* checkpoint.put(cursor + 1).pipe(Effect.orDie);
            return Stream.make(cursor + 1).pipe(Stream.concat(Stream.never));
          }),
        ),
    });
    const boot = booter(store, Group, Layer.merge(handlers, middleware), {
      tag: Identity,
      initial: () => Effect.succeed('user-1'),
    });
    const first = socket();
    const firstServer = await boot([], first);
    await accept(firstServer);
    await send(
      firstServer,
      first,
      watch('1', [
        ['authorization', 'original-token'],
        ['invocation-kind', 'replay'],
      ]),
    );
    await vi.waitFor(() => expect(cursors).toEqual([0]));

    const resumed = first.hibernate();
    await boot([resumed]);
    await vi.waitFor(() => expect(cursors).toEqual([0, 1]));
    expect(admissions).toBe(1);
    expect(calls).toEqual([
      { kind: 'fresh', identity: 'user-1', token: 'original-token' },
      { kind: 'replay', identity: 'user-1', token: 'original-token' },
    ]);

    allowed = false;
    const denied = resumed.hibernate();
    await boot([denied]);
    await vi.waitFor(() => expect(denied.sent.join('')).toContain('Forbidden'));
    expect(cursors).toEqual([0, 1]);
    const saved = Option.getOrThrow(
      await Effect.runPromise(store().load(denied.port)),
    );
    expect(saved.streams).toEqual([]);
    expect(admissions).toBe(1);
  });

  it('removes a cancelled request so another activation cannot replay it', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store } = make();
    let starts = 0;
    const boot = booter(
      store,
      Plain,
      Plain.toLayer({
        watch: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              starts++;
              yield* (yield* Rpc.websocket.checkpoint(Schema.Number))
                .put(starts)
                .pipe(Effect.orDie);
              return Stream.never;
            }),
          ),
      }),
    );
    const s = socket();
    const server = await boot([], s);
    await accept(server);
    await send(server, s, watch('2'));
    await vi.waitFor(() => expect(starts).toBe(1));
    await send(
      server,
      s,
      JSON.stringify({ _tag: 'Interrupt', requestId: '2' }),
    );

    const next = s.hibernate();
    const nextServer = await boot([next]);
    await send(nextServer, next, JSON.stringify({ _tag: 'Ping' }));
    expect(starts).toBe(1);
  });

  it('closes a live socket whose record is missing, without replaying anything', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store } = make();
    let starts = 0;
    const boot = booter(
      store,
      Plain,
      Plain.toLayer({
        watch: () => Stream.unwrap(Effect.sync(() => (starts++, Stream.never))),
      }),
    );
    const kept = socket();
    const server = await boot([], kept);
    await accept(server);
    await send(server, kept, watch('1'));
    await vi.waitFor(() => expect(starts).toBe(1));

    // One socket lost its record (an unreadable attachment), the other did not.
    const lost = socket({ garbage: true });
    const resumed = kept.hibernate();
    const woken = await boot([lost, resumed]);
    await vi.waitFor(() => expect(starts).toBe(2));
    expect(lost.closed).toEqual([
      { code: Rpc.websocket.RESUME_LOST, reason: 'resume lost' },
    ]);
    expect(resumed.closed).toEqual([]);

    // A message from a socket the server has no record of closes it too.
    const stranger = socket();
    await send(woken, stranger, watch('9'));
    expect(stranger.closed).toEqual([{ code: 4000, reason: 'resume lost' }]);
    expect(starts).toBe(2);
  });
});

describe('with the sqlite Stream Store', () => {
  const [, sqlite] = stores;

  it('closes a socket whose rows are gone, and hard-deletes every row it ends', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store, rows } = sqlite.make();
    const boot = (live: TestSocket[], next?: TestSocket) =>
      Effect.runPromise(
        Rpc.websocket.server(
          Plain,
          Plain.toLayer({ watch: () => Stream.make(1, 2) }),
          {
            state: {
              getWebSockets: () => Effect.succeed(live.map(({ port }) => port)),
              setWebSocketAutoResponse: () => Effect.void,
            },
            upgrade: () =>
              Effect.succeed([
                HttpServerResponse.empty(),
                (next ?? live[0])!.port,
              ] as const),
            streams: store(),
          },
        ),
      );
    const s = socket();
    const server = await boot([], s);
    await accept(server);
    expect(rows()).toBe(1);
    await send(server, s, watch('1'));
    await vi.waitFor(() => expect(s.sent.join('')).toContain('Exit'));
    // The stream ended, so its row is gone; the socket's record stays.
    expect(rows()).toBe(1);
    await Effect.runPromise(server.close(s.port, 1000, 'bye'));
    expect(rows()).toBe(0);

    // The attachment still names a client, but its record is gone.
    const orphan = s.hibernate();
    await boot([orphan]);
    expect(orphan.closed).toEqual([{ code: 4000, reason: 'resume lost' }]);
  });

  it('hard-deletes, on boot, the rows of sockets whose close never arrived', async () => {
    vi.stubGlobal('WebSocketRequestResponsePair', class {});
    const { store, rows } = sqlite.make();
    const boot = (live: TestSocket[], next?: TestSocket) =>
      Effect.runPromise(
        Rpc.websocket.server(
          Plain,
          Plain.toLayer({ watch: () => Stream.never }),
          {
            state: {
              getWebSockets: () => Effect.succeed(live.map(({ port }) => port)),
              setWebSocketAutoResponse: () => Effect.void,
            },
            upgrade: () =>
              Effect.succeed([
                HttpServerResponse.empty(),
                (next ?? live[0])!.port,
              ] as const),
            streams: store(),
          },
        ),
      );
    const [a, b] = [socket(), socket()];
    const first = await boot([], a);
    await accept(first);
    await send(first, a, watch('1'));
    const second = await boot([a], b);
    await accept(second);
    await send(second, b, watch('1'));
    await vi.waitFor(() => expect(rows()).toBe(4));

    // Only `a` is still connected after the deploy; `b`'s close was lost.
    await boot([a.hibernate()]);
    expect(rows()).toBe(2);
  });
});
