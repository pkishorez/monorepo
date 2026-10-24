import { Effect, Layer, PubSub, Scope, Stream, SubscriptionRef } from 'effect';
import type { Session } from '@kestack/ai-toolkit/api';
import { Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { describe, expect, it } from 'vitest';
import {
  DeviceState,
  Machines,
  nobody,
  nothing,
} from '../../../layer/capabilities/index.ts';
import type { OnMachine } from '../../replica/index.ts';
import { type Intent, Moves } from '../../moves/index.ts';
import { SidebarLive } from './actor.ts';
import { doneOf, movedOf } from './moves.ts';
import { settledOf } from './settled-list/index.ts';

/*
 * Sessions put in the sidebar, with `Moves` stood in for: a swipe goes to
 * it as a swipe, and is said once kept; the Settled List's Un-settle goes
 * at once; every Session is drawn where `Moves` says it goes, until the
 * synced Session agrees; a refusal is said.
 */

type Going = typeof Intent.Type;

const row = (sessionId: string, settledAt: number | null) =>
  ({
    id: sessionId,
    projectId: 'p',
    machineId: 'm1',
    settledAt,
  }) as unknown as OnMachine<Session>;

const going = (
  sessionId: string,
  settled: boolean,
  n: number,
  idle = false,
): Going => ({ machineId: 'm1', sessionId, settled, n, idle });

describe('Sessions put, as the sidebar draws them', () => {
  it('show the most recently put Settled first, over any Settled before', () => {
    const shown = movedOf(
      [row('a', null), row('b', null), row('old', 1000)],
      [going('a', true, 1), going('b', true, 2)],
    );
    expect(settledOf([], shown).map(({ session }) => session.id)).toEqual([
      'b',
      'a',
      'old',
    ]);
  });

  it('go once nothing is left to ask and the synced Session agrees', () => {
    const now = [
      going('a', true, 1, true),
      going('b', false, 2, true),
      going('c', true, 3, false),
    ];
    expect(
      doneOf([row('a', 1000), row('b', 1000), row('c', 1000)], now),
    ).toEqual([{ machineId: 'm1', sessionId: 'a', settled: true }]);
  });
});

type Put = {
  readonly how: 'swipe' | 'set';
  readonly sessionId: string;
  readonly settled: boolean;
};

const stood = Effect.gen(function* () {
  const put: Array<Put> = [];
  const intents = yield* SubscriptionRef.make<ReadonlyArray<Going>>([]);
  const refusals = yield* PubSub.unbounded<{
    settled: boolean;
    reason: string;
  }>();
  const layer = Layer.mergeAll(
    Layer.succeed(
      Moves,
      Moves.of({
        intents: SubscriptionRef.changes(intents),
        refusals: Stream.fromPubSub(refusals),
        swipe: ({ sessionId }, settled) =>
          Effect.sync(() => put.push({ how: 'swipe', sessionId, settled })),
        set: ({ sessionId }, settled) =>
          Effect.sync(() => put.push({ how: 'set', sessionId, settled })),
        hurry: Effect.void,
        agreed: () => Effect.void,
      }),
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
  return { layer, put, intents, refusals };
});

const wait = (ms = 30) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect) as Effect.Effect<A>);

type Model = {
  readonly moving: ReadonlyArray<Going>;
  readonly told: { readonly title: string; readonly settled: boolean } | null;
  readonly refused: {
    readonly reason: string;
    readonly settled: boolean;
  } | null;
};

const start = (layer: Layer.Layer<any>) =>
  Runtime.start(SidebarLive as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;
const model = (app: Running<unknown>) => app.snapshot().model as Model;
const send = (app: Running<unknown>, message: object) =>
  app.send(app.snapshot().id, message as never);
const asked = (sessionId: string, settled: boolean, now: boolean) => ({
  _tag: 'MoveAsked',
  machineId: 'm1',
  sessionId,
  settled,
  title: now ? null : 'A session',
  now,
});

describe('a Session put in the sidebar', () => {
  it('goes to Moves as a swipe, said once kept, or at once from the Un-settle button', async () => {
    const { layer, put } = await Effect.runPromise(stood);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, asked('s1', true, false));
        yield* wait();
        expect(model(app).told).toMatchObject({
          title: 'A session',
          settled: true,
        });
        send(app, asked('s2', false, true));
        yield* wait();
        expect(put).toEqual([
          { how: 'swipe', sessionId: 's1', settled: true },
          { how: 'set', sessionId: 's2', settled: false },
        ]);
      }),
    );
  });

  it('draws where Moves says each Session goes, and says each refusal', async () => {
    const { layer, intents, refusals } = await Effect.runPromise(stood);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        yield* SubscriptionRef.set(intents, [going('s1', true, 1)]);
        yield* PubSub.publish(refusals, {
          settled: false,
          reason: 'Not found',
        });
        yield* wait();
        expect(model(app).moving).toEqual([going('s1', true, 1)]);
        expect(model(app).refused).toMatchObject({
          settled: false,
          reason: 'Not found',
        });
      }),
    );
  });
});
