import {
  Deferred,
  Effect,
  Layer,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD, layer, Moves } from '../moves.ts';

/*
 * Moves, with every Machine stood in for and the clock in the test's
 * hands: each put is asked at once; a Session's calls go one at a time,
 * in order, the last put always asked after the call in flight; each
 * answer is its own call's, so only a refusal of the last put drops it and
 * says why; a Move goes once the synced Session
 * agrees, or HOLD after its last call; each Session is on its own.
 */

type Asked = { readonly sessionId: string; readonly settled: boolean };

/** Machines that note each call, `n`th from 1, holding or refusing some. */
const machines = (
  hold: ReadonlyMap<number, Deferred.Deferred<void>> = new Map(),
  refuse: ReadonlySet<number> = new Set(),
) => {
  const asked: Array<Asked> = [];
  const ask = (sessionId: string, settled: boolean) =>
    Effect.gen(function* () {
      asked.push({ sessionId, settled });
      const n = asked.length;
      const held = hold.get(n);
      if (held !== undefined) yield* Deferred.await(held);
      if (refuse.has(n))
        return yield* Effect.fail({
          _tag: 'SessionNotFound' as const,
          sessionId,
        });
    });
  const layer = CodeClients.make(() =>
    Layer.merge(
      Layer.mock(CodeClient)({
        settleSession: ({ sessionId }: { readonly sessionId: string }) =>
          ask(sessionId, true),
        unsettleSession: ({ sessionId }: { readonly sessionId: string }) =>
          ask(sessionId, false),
      } as never),
      Layer.mock(RpcConnection)({
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  );
  return { layer, asked };
};

const at = (sessionId: string) => ({ machineId: 'm1', sessionId });

/** Lets `ms` of the test's clock go by. */
const pass = (ms: number) =>
  Effect.promise(() => vi.advanceTimersByTimeAsync(ms));

const start = (world: ReturnType<typeof machines>) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const context = yield* Layer.buildWithScope(
      layer.pipe(Layer.provide(world.layer)),
      scope,
    );
    const moves = yield* Effect.provideContext(
      Effect.gen(function* () {
        return yield* Moves;
      }),
      context,
    );
    const shown = yield* SubscriptionRef.make<
      ReadonlyArray<{ sessionId: string; settled: boolean; idle: boolean }>
    >([]);
    yield* Effect.forkIn(
      Stream.runForEach(moves.intents, (now) =>
        SubscriptionRef.set(shown, now),
      ),
      scope,
    );
    const refused: Array<{ settled: boolean; reason: string }> = [];
    yield* Effect.forkIn(
      Stream.runForEach(moves.refusals, (one) =>
        Effect.sync(() => refused.push(one)),
      ),
      scope,
    );
    return { moves, shown: () => SubscriptionRef.get(shown), refused };
  });

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

const held = () => Effect.runPromise(Deferred.make<void>());

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

describe('Moves', () => {
  it('asks its Machine at once', async () => {
    const world = machines();
    await run(
      Effect.gen(function* () {
        const { moves, shown } = yield* start(world);
        yield* moves.put(at('s1'), true);
        yield* pass(0);
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: true, idle: true },
        ]);
      }),
    );
  });

  it('asks a Settle and its Undo in order, ending un-Settled, and holds the row no longer than HOLD', async () => {
    const first = await held();
    const world = machines(new Map([[1, first]]));
    await run(
      Effect.gen(function* () {
        const { moves, shown } = yield* start(world);
        yield* moves.put(at('s1'), true);
        yield* pass(0);
        yield* moves.put(at('s1'), false);
        yield* pass(0);
        // The Undo waits for the Settle in flight.
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
        yield* Deferred.succeed(first, undefined);
        yield* pass(0);
        expect(world.asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: false, idle: true },
        ]);
        // A stale snapshot and the Settle's echo do not agree: held, but
        // not past HOLD.
        yield* moves.agreed(at('s1'), true);
        yield* pass(HOLD - 100);
        expect(yield* shown()).toHaveLength(1);
        yield* pass(200);
        expect(yield* shown()).toEqual([]);
      }),
    );
  });

  it('lets go at once as the synced Session agrees', async () => {
    const world = machines();
    await run(
      Effect.gen(function* () {
        const { moves, shown } = yield* start(world);
        yield* moves.put(at('s1'), true);
        yield* pass(0);
        yield* moves.agreed(at('s1'), true);
        yield* pass(0);
        expect(yield* shown()).toEqual([]);
      }),
    );
  });

  it('asks the last put again after the call in flight, even one its Machine may have taken', async () => {
    const first = await held();
    const world = machines(new Map([[1, first]]));
    await run(
      Effect.gen(function* () {
        const { moves } = yield* start(world);
        yield* moves.put(at('s1'), true);
        yield* pass(0);
        yield* moves.put(at('s1'), false);
        yield* moves.put(at('s1'), true);
        yield* Deferred.succeed(first, undefined);
        yield* pass(0);
        expect(world.asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: true },
        ]);
      }),
    );
  });

  it('asks an Undo queued behind a call whose answer was lost, so the Machine ends where it was put', async () => {
    const second = await held();
    // The re-Settle lands on the Machine, but its answer never comes back.
    const world = machines(new Map([[2, second]]), new Set([2]));
    await run(
      Effect.gen(function* () {
        const { moves, shown, refused } = yield* start(world);
        yield* moves.put(at('s1'), false);
        yield* pass(0);
        yield* moves.put(at('s1'), true);
        yield* pass(0);
        yield* moves.put(at('s1'), false);
        yield* Deferred.succeed(second, undefined);
        yield* pass(0);
        expect(world.asked).toEqual([
          { sessionId: 's1', settled: false },
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
        expect(refused).toEqual([]);
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: false, idle: true },
        ]);
      }),
    );
  });

  it('still asks a later put when an earlier call is refused, and says nothing of it', async () => {
    const first = await held();
    const world = machines(new Map([[1, first]]), new Set([1]));
    await run(
      Effect.gen(function* () {
        const { moves, shown, refused } = yield* start(world);
        yield* moves.put(at('s1'), true);
        yield* pass(0);
        yield* moves.put(at('s1'), false);
        yield* Deferred.succeed(first, undefined);
        yield* pass(0);
        expect(world.asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
        expect(refused).toEqual([]);
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: false, idle: true },
        ]);
      }),
    );
  });

  it('puts the row back, and says why, when the last put is refused', async () => {
    const world = machines(new Map(), new Set([1]));
    await run(
      Effect.gen(function* () {
        const { moves, shown, refused } = yield* start(world);
        yield* moves.put(at('s1'), false);
        yield* pass(0);
        expect(yield* shown()).toEqual([]);
        expect(refused).toMatchObject([{ settled: false }]);
        expect(refused[0]?.reason).not.toBe('');
      }),
    );
  });

  it('keeps each Session on its own: one in flight holds up no other', async () => {
    const first = await held();
    const world = machines(new Map([[1, first]]));
    await run(
      Effect.gen(function* () {
        const { moves } = yield* start(world);
        yield* moves.put(at('a'), true);
        yield* pass(0);
        yield* moves.put(at('b'), true);
        yield* pass(0);
        expect(world.asked).toEqual([
          { sessionId: 'a', settled: true },
          { sessionId: 'b', settled: true },
        ]);
        yield* Deferred.succeed(first, undefined);
      }),
    );
  });
});
