import {
  Deferred,
  Effect,
  Exit,
  Layer,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceState } from '../../layer/capabilities/index.ts';
import { deviceStateMemory } from '../../layer/services/index.ts';
import { layer, Moves, WINDOW } from './index.ts';

/*
 * Moves, with every Machine stood in for, Device State in memory and the
 * clock in the test's hands: a swipe is asked once its window closes and
 * an Undo inside it asks nothing; a button is asked at once, after any call
 * of its Session in flight; each Session is on its own; the page going asks
 * everything waiting at once; what was put is kept until its Machine
 * confirms it, and asked again by the Moves that start next; a refusal
 * drops it and says why.
 */

type Asked = { readonly sessionId: string; readonly settled: boolean };

const machines = (hold: ReadonlyMap<string, Deferred.Deferred<void>>) => {
  const asked: Array<Asked> = [];
  const refuse = new Set<string>();
  const ask = (sessionId: string, settled: boolean) =>
    Effect.gen(function* () {
      asked.push({ sessionId, settled });
      const held = hold.get(`${sessionId}:${asked.length}`);
      if (held !== undefined) yield* Deferred.await(held);
      if (refuse.has(sessionId))
        return yield* Effect.fail({
          _tag: 'SessionNotFound' as const,
          sessionId,
        });
    });
  const layer = AiClients.make(() =>
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
  );
  return { layer, asked, refuse };
};

const at = (sessionId: string) => ({ machineId: 'm1', sessionId });

/** Lets `ms` of the test's clock go by. */
const pass = (ms: number) =>
  Effect.promise(() => vi.advanceTimersByTimeAsync(ms));

/** Moves started on `scope`, over `device` and `world`, as a page starts them. */
const start = (
  scope: Scope.Scope,
  device: Layer.Layer<DeviceState>,
  world: ReturnType<typeof machines>,
) =>
  Effect.gen(function* () {
    const context = yield* Layer.buildWithScope(
      layer.pipe(Layer.provide(Layer.merge(device, world.layer))),
      scope,
    );
    const service = yield* Effect.provideContext(
      Effect.gen(function* () {
        return yield* Moves;
      }),
      context,
    );
    const shown = yield* SubscriptionRef.make<
      ReadonlyArray<{ sessionId: string; settled: boolean; idle: boolean }>
    >([]);
    yield* Effect.forkIn(
      Stream.runForEach(service.intents, (now) =>
        SubscriptionRef.set(shown, now),
      ),
      scope,
    );
    const refused: Array<{ settled: boolean; reason: string }> = [];
    yield* Effect.forkIn(
      Stream.runForEach(service.refusals, (one) =>
        Effect.sync(() => refused.push(one)),
      ),
      scope,
    );
    return { service, shown: () => SubscriptionRef.get(shown), refused };
  });

const kept = (device: Layer.Layer<DeviceState>) =>
  Effect.provide(
    Effect.map(DeviceState.read, ({ moves }) => moves['m1'] ?? {}),
    device,
  );

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

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
  it('asks nothing for a swipe Undone inside its window, and keeps nothing', async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service, shown } = yield* start(
          yield* Effect.scope,
          device,
          world,
        );
        yield* service.swipe(at('s1'), true);
        expect(yield* kept(device)).toEqual({ s1: true });
        yield* pass(1000);
        yield* service.swipe(at('s1'), false);
        yield* pass(WINDOW + 1000);
        expect(world.asked).toEqual([]);
        expect(yield* kept(device)).toEqual({});
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: false, idle: true },
        ]);
        yield* service.agreed(at('s1'), false);
        expect(yield* shown()).toEqual([]);
      }),
    );
  });

  it('asks a swipe once its window closes, keeping it until its Machine confirms it', async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service, shown } = yield* start(
          yield* Effect.scope,
          device,
          world,
        );
        yield* service.swipe(at('s1'), true);
        yield* pass(WINDOW - 100);
        expect(world.asked).toEqual([]);
        yield* pass(200);
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
        expect(yield* kept(device)).toEqual({});
        // Shown Settled until the synced Session is, then gone.
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: true, idle: true },
        ]);
        yield* service.agreed(at('s1'), false);
        expect(yield* shown()).toHaveLength(1);
        yield* service.agreed(at('s1'), true);
        expect(yield* shown()).toEqual([]);
      }),
    );
  });

  it("asks the Un-settle button inside a swipe's window as nothing: the Machine stays un-Settled", async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service, shown } = yield* start(
          yield* Effect.scope,
          device,
          world,
        );
        yield* service.swipe(at('s1'), true);
        yield* pass(1000);
        yield* service.set(at('s1'), false);
        yield* pass(WINDOW + 1000);
        expect(world.asked).toEqual([]);
        yield* service.agreed(at('s1'), false);
        expect(yield* shown()).toEqual([]);
      }),
    );
  });

  it('asks an Un-settle after a Settle landed, and lets go only once the synced Session is un-Settled', async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service, shown } = yield* start(
          yield* Effect.scope,
          device,
          world,
        );
        yield* service.swipe(at('s1'), true);
        yield* pass(WINDOW + 100);
        yield* service.set(at('s1'), false);
        yield* pass(10);
        expect(world.asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
        // The Settle's late update leaves it un-Settled, and held.
        yield* service.agreed(at('s1'), true);
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: false, idle: true },
        ]);
        yield* service.agreed(at('s1'), false);
        expect(yield* shown()).toEqual([]);
      }),
    );
  });

  it("asks Session Actions' Settle at once, over a swipe still waiting, and once", async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service } = yield* start(yield* Effect.scope, device, world);
        yield* service.swipe(at('s1'), true);
        yield* pass(500);
        yield* service.set(at('s1'), true);
        yield* pass(10);
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
        yield* pass(WINDOW * 2);
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
      }),
    );
  });

  it('asks a button after the call of its Session in flight, and each Session on its own', async () => {
    const first = await Effect.runPromise(Deferred.make<void>());
    const world = machines(new Map([['a:1', first]]));
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service } = yield* start(yield* Effect.scope, device, world);
        yield* service.set(at('a'), true);
        yield* pass(10);
        // While a's call waits: a set back, b swiped and Undone, c swiped.
        yield* service.set(at('a'), false);
        yield* service.swipe(at('b'), true);
        yield* service.swipe(at('c'), true);
        yield* service.swipe(at('b'), false);
        yield* pass(WINDOW + 100);
        expect(world.asked).toEqual([
          { sessionId: 'a', settled: true },
          { sessionId: 'c', settled: true },
        ]);
        yield* Deferred.succeed(first, undefined);
        yield* pass(10);
        expect(world.asked).toEqual([
          { sessionId: 'a', settled: true },
          { sessionId: 'c', settled: true },
          { sessionId: 'a', settled: false },
        ]);
      }),
    );
  });

  it('asks everything waiting at once as the page goes', async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service } = yield* start(yield* Effect.scope, device, world);
        yield* service.swipe(at('s1'), true);
        yield* pass(500);
        yield* service.hurry;
        yield* pass(0);
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
      }),
    );
  });

  it('asks again, as the next Moves start, a swipe whose page went inside its window', async () => {
    const world = machines(new Map());
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const page = yield* Scope.make();
        const { service } = yield* start(page, device, world);
        yield* service.swipe(at('s1'), true);
        yield* pass(1000);
        yield* Scope.close(page, Exit.void);
        expect(world.asked).toEqual([]);
        const { shown } = yield* start(yield* Effect.scope, device, world);
        yield* pass(10);
        expect(world.asked).toEqual([{ sessionId: 's1', settled: true }]);
        expect(yield* kept(device)).toEqual({});
        expect(yield* shown()).toMatchObject([
          { sessionId: 's1', settled: true },
        ]);
      }),
    );
  });

  it('keeps the newer of a call in flight and a later put as it stops, and the next Moves ask it', async () => {
    const first = await Effect.runPromise(Deferred.make<void>());
    const world = machines(new Map([['s1:1', first]]));
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const page = yield* Scope.make();
        const { service } = yield* start(page, device, world);
        yield* service.set(at('s1'), true);
        yield* pass(10);
        yield* service.swipe(at('s1'), false);
        expect(yield* kept(device)).toEqual({ s1: false });
        yield* Scope.close(page, Exit.void);
        yield* start(yield* Effect.scope, device, world);
        yield* pass(10);
        expect(world.asked).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's1', settled: false },
        ]);
        expect(yield* kept(device)).toEqual({});
      }),
    );
  });

  it('drops a refused Move, forgets it and says why', async () => {
    const world = machines(new Map());
    world.refuse.add('s2');
    const device = deviceStateMemory();
    await run(
      Effect.gen(function* () {
        const { service, shown, refused } = yield* start(
          yield* Effect.scope,
          device,
          world,
        );
        yield* service.set(at('s2'), false);
        yield* pass(10);
        expect(world.asked).toEqual([{ sessionId: 's2', settled: false }]);
        expect(yield* shown()).toEqual([]);
        expect(yield* kept(device)).toEqual({});
        expect(refused).toMatchObject([{ settled: false }]);
        expect(refused[0]?.reason).not.toBe('');
      }),
    );
  });
});
