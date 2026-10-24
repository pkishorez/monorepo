import { Deferred, Effect, Layer, Scope, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import {
  DeviceState,
  Machines,
  nobody,
  nothing,
} from '../../../layer/capabilities/index.ts';
import type { Session } from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';
import { SidebarLive } from './actor.ts';
import { type Move, movedOf } from './moves.ts';
import { settledOf } from './settled-list/index.ts';

/*
 * Sessions swiped in the sidebar, with every Machine stood in for: a swipe
 * shows where the Session goes at once and asks its Machine; an Undo asks
 * the other way only after what it undoes; a refusal puts it back and says
 * why; and a Move is kept until the synced rows agree.
 */

type Asked = { readonly sessionId: string; readonly settled: boolean };

const world = (
  first: Deferred.Deferred<void> | null,
  refuse: ReadonlySet<string> = new Set(),
) => {
  const asked: Array<Asked> = [];
  const ask = (sessionId: string, settled: boolean) =>
    Effect.gen(function* () {
      const waits = first !== null && asked.length === 0;
      asked.push({ sessionId, settled });
      if (waits) yield* Deferred.await(first);
      if (refuse.has(sessionId)) {
        return yield* Effect.fail({
          _tag: 'SessionNotFound' as const,
          sessionId,
        });
      }
    });
  const layer = Layer.mergeAll(
    AiClients.make(() =>
      Layer.merge(
        Layer.mock(AiClient)({
          settleSession: ({ sessionId }: { readonly sessionId: string }) =>
            ask(sessionId, true),
          unsettleSession: ({ sessionId }: { readonly sessionId: string }) =>
            ask(sessionId, false),
        } as never),
        Layer.mock(RpcConnection)({
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      ),
    ),
    Layer.mock(Machines)({
      state: Stream.concat(Stream.make(nobody), Stream.never),
    }),
    Layer.mock(DeviceState)({
      read: Effect.succeed(nothing),
      changes: Stream.never,
    }),
    Layer.mock(Navigation)({ push: () => Effect.void }),
  );
  return { layer, asked };
};

const wait = (ms = 30) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

const start = (layer: Layer.Layer<any>) =>
  Runtime.start(SidebarLive as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;

type Model = {
  readonly moving: ReadonlyArray<{
    readonly sessionId: string;
    readonly settled: boolean;
    readonly done: boolean;
  }>;
  readonly refused: {
    readonly reason: string;
    readonly settled: boolean;
  } | null;
};

const model = (app: Running<unknown>) => app.snapshot().model as Model;
const send = (app: Running<unknown>, message: object) =>
  app.send(app.snapshot().id, message as never);
const move = (sessionId: string, settled: boolean) => ({
  _tag: 'MoveAsked',
  machineId: 'm1',
  sessionId,
  settled,
});

describe('a Session swiped in the sidebar', () => {
  it('shows where it goes at once, and asks its Machine to Settle it', async () => {
    const { layer, asked } = world(null);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        expect(model(app).moving).toMatchObject([
          { sessionId: 's1', settled: true },
        ]);
        yield* wait();
        expect(asked).toEqual([{ sessionId: 's1', settled: true }]);
        expect(model(app).moving).toMatchObject([
          { sessionId: 's1', settled: true, done: true },
        ]);
        // Kept until the synced rows agree.
        send(app, { _tag: 'MoveSeen', machineId: 'm1', sessionId: 's1' });
        yield* wait();
        expect(model(app).moving).toEqual([]);
      }),
    );
  });

  it('asks its Undo only after what it undoes', async () => {
    const first = await Effect.runPromise(Deferred.make<void>());
    const { layer, asked } = world(first);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        yield* wait();
        send(app, move('s1', false));
        yield* wait();
        // The Settle is still on its way: the Undo waits for it.
        expect(asked).toEqual([{ sessionId: 's1', settled: true }]);
        expect(model(app).moving).toMatchObject([
          { sessionId: 's1', settled: false, done: false },
        ]);
        yield* Deferred.succeed(first, undefined);
        yield* wait(120);
        expect(asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
        expect(model(app).moving).toMatchObject([
          { sessionId: 's1', settled: false, done: true },
        ]);
      }),
    );
  });

  it('goes back where it was, and says why, when its Machine refuses', async () => {
    const { layer, asked } = world(null, new Set(['s2']));
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        send(app, move('s2', false));
        yield* wait(120);
        expect(asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's2', settled: false },
        ]);
        expect(model(app).moving.map(({ sessionId }) => sessionId)).toEqual([
          's1',
        ]);
        expect(model(app).refused).toMatchObject({ settled: false });
        expect(model(app).refused?.reason).not.toBe('');
      }),
    );
  });
});

describe('Sessions swiped to Settle, before their Machine says so', () => {
  const session = (id: string, settledAt: number | null) =>
    ({
      id,
      projectId: 'p',
      machineId: 'm1',
      settledAt,
    }) as OnMachine<Session>;
  const move = (n: number, sessionId: string): Move => ({
    n,
    machineId: 'm1',
    sessionId,
    settled: true,
    done: false,
  });

  it('show in the Settled List the most recently swiped first, over any Settled before', () => {
    const shown = movedOf(
      [session('a', null), session('b', null), session('old', Date.now())],
      [move(1, 'a'), move(2, 'b')],
    );
    expect(settledOf([], shown).map(({ session }) => session.id)).toEqual([
      'b',
      'a',
      'old',
    ]);
  });
});
