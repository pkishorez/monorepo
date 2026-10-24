import { Deferred, Effect, Layer, Scope, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeviceState,
  Machines,
  nobody,
  nothing,
} from '../../../layer/capabilities/index.ts';
import type { Session } from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';
import { SidebarLive } from './actor.ts';
import { doneOf, type Move, movedOf, WINDOW } from './moves.ts';
import { settledOf } from './settled-list/index.ts';

/*
 * Sessions swiped in the sidebar, with every Machine stood in for and the
 * clock in the test's hands: a swipe shows where the Session goes at once
 * and asks its Machine only once its Undo window closes; an Undo inside it
 * asks nothing; each Session has its own window and its own call; the page
 * going, or the sidebar stopping, asks what is still waiting; a refusal
 * puts it back and says why.
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

/** Lets `ms` of the test's clock go by. */
const pass = (ms: number) =>
  Effect.promise(() => vi.advanceTimersByTimeAsync(ms));

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

const start = (layer: Layer.Layer<any>) =>
  Runtime.start(SidebarLive as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;

type Model = {
  readonly moving: ReadonlyArray<Move>;
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

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'performance',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const row = (sessionId: string, settledAt: number | null) =>
  ({
    id: sessionId,
    projectId: 'p',
    machineId: 'm1',
    settledAt,
  }) as unknown as OnMachine<Session>;
/** Whether the row shows Settled, with the Session as synced `settled`. */
const shownSettled = (
  app: Running<unknown>,
  sessionId: string,
  settled: boolean,
) =>
  movedOf([row(sessionId, settled ? 1000 : null)], model(app).moving)[0]!
    .settledAt !== null;

describe('a Session swiped in the sidebar', () => {
  it('asks its Machine nothing for a swipe Undone inside its window, and never flips', async () => {
    const { layer, asked } = world(null);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        expect(shownSettled(app, 's1', false)).toBe(true);
        yield* pass(1000);
        send(app, move('s1', false));
        const shown: Array<boolean> = [];
        for (let at = 0; at < 8; at++) {
          shown.push(shownSettled(app, 's1', false));
          yield* pass(1000);
        }
        expect(asked).toEqual([]);
        expect(shown.every((settled) => !settled)).toBe(true);
        // Nothing waits: it goes as the synced row agrees.
        expect(doneOf([row('s1', null)], model(app).moving)).toEqual([
          { machineId: 'm1', sessionId: 's1' },
        ]);
      }),
    );
  });

  it('asks its Machine once the window closes, and keeps the row where it went', async () => {
    const { layer, asked } = world(null);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        yield* pass(WINDOW - 200);
        expect(asked).toEqual([]);
        yield* pass(400);
        expect(asked).toEqual([{ sessionId: 's1', settled: true }]);
        expect(model(app).moving).toMatchObject([
          {
            sessionId: 's1',
            settled: true,
            base: true,
            asking: null,
            due: null,
          },
        ]);
        expect(shownSettled(app, 's1', false)).toBe(true);
        send(app, { _tag: 'MoveSeen', machineId: 'm1', sessionId: 's1' });
        yield* pass(10);
        expect(model(app).moving).toEqual([]);
      }),
    );
  });

  it('keeps each Session on its own: one being asked holds up no other', async () => {
    const first = await Effect.runPromise(Deferred.make<void>());
    const { layer, asked } = world(first);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('a', true));
        yield* pass(WINDOW + 200);
        expect(asked).toEqual([{ sessionId: 'a', settled: true }]);
        // While a's call waits: b Settled and Undone, c Settled.
        send(app, move('b', true));
        send(app, move('c', true));
        yield* pass(500);
        send(app, move('b', false));
        yield* pass(WINDOW + 200);
        expect(asked).toEqual([
          { sessionId: 'a', settled: true },
          { sessionId: 'c', settled: true },
        ]);
        expect(shownSettled(app, 'b', false)).toBe(false);
        // b asked nothing and is done; c waits for its Settle to sync.
        expect(
          doneOf([row('b', null), row('c', null)], model(app).moving),
        ).toEqual([{ machineId: 'm1', sessionId: 'b' }]);
        yield* Deferred.succeed(first, undefined);
        yield* pass(200);
        expect(
          model(app).moving.find(({ sessionId }) => sessionId === 'a'),
        ).toMatchObject({ base: true, asking: null, due: null });
      }),
    );
  });

  it('asks a swipe made while the last is being asked once that lands, if it still differs', async () => {
    const first = await Effect.runPromise(Deferred.make<void>());
    const { layer, asked } = world(first);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        yield* pass(WINDOW + 200);
        send(app, move('s1', false));
        yield* pass(WINDOW + 200);
        expect(asked).toEqual([{ sessionId: 's1', settled: true }]);
        yield* Deferred.succeed(first, undefined);
        yield* pass(300);
        expect(asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
      }),
    );
  });

  it('asks what is waiting at once as the page is hidden', async () => {
    const { layer, asked } = world(null);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        yield* pass(500);
        send(app, { _tag: 'MovesFlushed' });
        yield* pass(300);
        expect(asked).toEqual([{ sessionId: 's1', settled: true }]);
      }),
    );
  });

  it('asks what is waiting as the sidebar stops', async () => {
    const { layer, asked } = world(null);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        yield* pass(500);
        expect(asked).toEqual([]);
      }),
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(asked).toEqual([{ sessionId: 's1', settled: true }]);
  });

  it('goes back where it was, and says why, when its Machine refuses', async () => {
    const { layer, asked } = world(null, new Set(['s2']));
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, move('s1', true));
        send(app, move('s2', false));
        yield* pass(WINDOW + 300);
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
  const move = (n: number, sessionId: string): Move => ({
    n,
    machineId: 'm1',
    sessionId,
    settled: true,
    base: false,
    asking: null,
    due: 0,
  });

  it('show in the Settled List the most recently swiped first, over any Settled before', () => {
    const shown = movedOf(
      [row('a', null), row('b', null), row('old', Date.now())],
      [move(1, 'a'), move(2, 'b')],
    );
    expect(settledOf([], shown).map(({ session }) => session.id)).toEqual([
      'b',
      'a',
      'old',
    ]);
  });
});
