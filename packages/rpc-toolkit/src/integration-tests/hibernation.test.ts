import { Context, Effect, Layer, Option, Schema, Stream } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/unstable/rpc';
import { afterEach, expect, expectTypeOf, it, vi } from 'vitest';
import { Cannotation } from '../rpc/cannotation/index.js';
import { InvocationKind } from '../rpc/invocation/index.js';
import {
  makeHibernatingWebSocketRpc,
  StreamCheckpoint,
  type HibernatingSocket,
} from '../rpc/cloudflare/hibernating-rpc/index.js';

class Forbidden extends Schema.Error<Forbidden>('replay/Forbidden')({
  _tag: Schema.tag('Forbidden'),
}) {}
const Access = Cannotation.make<boolean>()('replay/Access', {
  error: Forbidden,
});
const Group = Access.with(true)(
  RpcGroup.make(Rpc.make('watch', { success: Schema.Number, stream: true })),
);
const Identity = Context.Reference<string>('replay/Identity', {
  defaultValue: () => 'anonymous',
});

function socket(seed: unknown = null) {
  let attachment = structuredClone(seed);
  const sent: string[] = [];
  const ws = { send: (data: string) => sent.push(data), close: () => {} };
  const port: HibernatingSocket = {
    ws: ws as unknown as HibernatingSocket['ws'],
    close: () => Effect.void,
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: <T>() => attachment as T | null,
  };
  return {
    port,
    sent,
    snapshot: () => structuredClone(attachment) as { handlers: unknown[] },
  };
}

afterEach(() => vi.unstubAllGlobals());

it('rechecks authorization on replay, preserves checkpoints, and never trusts a client replay header', async () => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
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
      const kind = yield* InvocationKind;
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
          const checkpoint = yield* StreamCheckpoint(Schema.NumberFromString);
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
  const boot = (s: ReturnType<typeof socket>) =>
    Effect.runPromise(
      makeHibernatingWebSocketRpc({
        group: Group,
        layer: Layer.merge(handlers, middleware),
        state: {
          getWebSockets: () => Effect.succeed([s.port]),
          setWebSocketAutoResponse: () => Effect.void,
        },
        upgrade: () =>
          Effect.succeed([HttpServerResponse.empty(), s.port] as const),
        connection: { tag: Identity, initial: () => Effect.succeed('user-1') },
      }).pipe(Effect.provide(RpcSerialization.layerJson)),
    );
  const first = socket({ clientId: 1, handlers: [], connection: 'user-1' });
  const firstServer = await boot(first);
  await Effect.runPromise(
    firstServer.message(
      first.port,
      JSON.stringify({
        _tag: 'Request',
        id: '1',
        tag: 'watch',
        payload: null,
        headers: [
          ['authorization', 'original-token'],
          ['invocation-kind', 'replay'],
        ],
      }),
    ),
  );
  await vi.waitFor(() => expect(cursors).toEqual([0]));
  const saved = first.snapshot();
  expect(saved).toMatchObject({ handlers: [{ state: '1' }] });
  await Effect.runPromise(
    firstServer.close(first.port, 1000, 'test boot ends'),
  );

  const resumed = socket(saved);
  const resumedServer = await boot(resumed);
  await vi.waitFor(() => expect(cursors).toEqual([0, 1]));
  expect(admissions).toBe(1);
  expect(calls).toEqual([
    { kind: 'fresh', identity: 'user-1', token: 'original-token' },
    { kind: 'replay', identity: 'user-1', token: 'original-token' },
  ]);
  const resumedSaved = resumed.snapshot();
  await Effect.runPromise(
    resumedServer.close(resumed.port, 1000, 'test boot ends'),
  );

  allowed = false;
  const denied = socket(resumedSaved);
  const deniedServer = await boot(denied);
  await vi.waitFor(() => expect(denied.sent.join('')).toContain('Forbidden'));
  expect(cursors).toEqual([0, 1]);
  expect(denied.snapshot().handlers).toEqual([]);
  expect(admissions).toBe(1);
  await Effect.runPromise(deniedServer.close(denied.port, 1000, 'done'));
});

it('removes a cancelled request so another activation cannot replay it', async () => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  let starts = 0;
  const s = socket();
  const Plain = RpcGroup.make(
    Rpc.make('watch', { success: Schema.Number, stream: true }),
  );
  const boot = (target: ReturnType<typeof socket>) =>
    Effect.runPromise(
      makeHibernatingWebSocketRpc({
        group: Plain,
        layer: Plain.toLayer({
          watch: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                starts++;
                yield* (yield* StreamCheckpoint(Schema.Number))
                  .put(starts)
                  .pipe(Effect.orDie);
                return Stream.never;
              }),
            ),
        }),
        state: {
          getWebSockets: () => Effect.succeed([target.port]),
          setWebSocketAutoResponse: () => Effect.void,
        },
        upgrade: () =>
          Effect.succeed([HttpServerResponse.empty(), target.port] as const),
      }).pipe(Effect.provide(RpcSerialization.layerJson)),
    );
  const server = await boot(s);
  await Effect.runPromise(
    server.message(
      s.port,
      JSON.stringify({
        _tag: 'Request',
        id: '2',
        tag: 'watch',
        payload: null,
        headers: [],
      }),
    ),
  );
  await vi.waitFor(() => expect(s.snapshot().handlers).toHaveLength(1));
  await Effect.runPromise(
    server.message(
      s.port,
      JSON.stringify({ _tag: 'Interrupt', requestId: '2' }),
    ),
  );
  expect(s.snapshot().handlers).toEqual([]);
  const next = socket(s.snapshot());
  const nextServer = await boot(next);
  await Effect.runPromise(
    nextServer.message(next.port, JSON.stringify({ _tag: 'Ping' })),
  );
  expect(starts).toBe(1);
  await Effect.runPromise(server.close(s.port, 1000, 'done'));
  await Effect.runPromise(nextServer.close(next.port, 1000, 'done'));
});
