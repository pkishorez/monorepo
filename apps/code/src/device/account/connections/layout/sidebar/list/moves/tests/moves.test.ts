import { Effect, Layer, PubSub, Scope, Stream, SubscriptionRef } from 'effect';
import type { Session } from '@kestack/connect/code';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Snapshot } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { describe, expect, it } from 'vitest';
import { ConnectionFilter } from '../../../../../store.ts';
import { Preferences, nothing } from '../../../../../../../store.ts';
import { Connections, nobody } from '../../../../../connections.ts';
import {
  type Intent,
  Moves,
  type OnConnection,
} from '../../../../../connection/records/index.ts';
import { SidebarLive } from '../../../actor.ts';
import { doneOf, movedOf } from '../moves.ts';
import { settledOf } from '../../settled/settled.tsx';

/*
 * Sessions put in the sidebar, with `Moves` stood in for: a swipe, its
 * Undo and the Settled List's Un-settle each go to it, a swipe said with
 * its Undo; every Session is drawn where `Moves` says it goes, until the
 * synced Session agrees; a refusal is said.
 */

type Going = typeof Intent.Type;

const row = (sessionId: string, settledAt: number | null) =>
  ({
    id: sessionId,
    projectId: 'p',
    connectionId: 'm1',
    settledAt,
  }) as unknown as OnConnection<Session>;

const going = (
  sessionId: string,
  settled: boolean,
  n: number,
  idle = false,
): Going => ({ connectionId: 'm1', sessionId, settled, n, idle });

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
    ).toEqual([{ connectionId: 'm1', sessionId: 'a', settled: true }]);
  });
});

type Put = { readonly sessionId: string; readonly settled: boolean };

const stood = Effect.gen(function* () {
  const put: Array<Put> = [];
  const intents = yield* SubscriptionRef.make<ReadonlyArray<Going>>([]);
  const refusals = yield* PubSub.unbounded<{
    connectionId: string;
    sessionId: string;
    settled: boolean;
    reason: string;
  }>();
  const layer = Layer.mergeAll(
    Layer.succeed(
      Moves,
      Moves.of({
        intents: SubscriptionRef.changes(intents),
        refusals: Stream.fromPubSub(refusals),
        put: ({ sessionId }, settled) =>
          Effect.sync(() => put.push({ sessionId, settled })),
        agreed: () => Effect.void,
      }),
    ),
    Layer.mock(Connections)({
      state: Stream.concat(Stream.make(nobody), Stream.never),
    }),
    Layer.mock(Preferences)({
      read: Effect.succeed(nothing),
      changes: Stream.never,
    }),
    Layer.mock(ConnectionFilter)({
      read: () => Effect.succeed(null),
      collapsed: () => Effect.succeed([]),
      changes: () => Stream.never,
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

/** Layout's part: the sidebar, for the Account drawn. */
const Owner = Actor.define('Owner', {});
const OwnerLive = Actor.build(Owner, {
  children: {
    sidebar: { actor: SidebarLive, props: () => ({ accountId: 'a1' }) },
  },
});

const start = (layer: Layer.Layer<any>) =>
  Runtime.start(OwnerLive as never, layer as never) as Effect.Effect<
    Runtime.Running<unknown>,
    never,
    Scope.Scope
  >;
const sidebar = (app: Runtime.Running<unknown>) =>
  app.snapshot().children['sidebar'] as Snapshot.Instance;
const model = (app: Runtime.Running<unknown>) => sidebar(app).model as Model;
const send = (app: Runtime.Running<unknown>, message: object) =>
  app.send(sidebar(app).id, message as never);
const asked = (sessionId: string, settled: boolean, swiped: boolean) => ({
  _tag: 'MoveAsked',
  connectionId: 'm1',
  sessionId,
  settled,
  title: swiped ? 'A session' : null,
});

describe('a Session put in the sidebar', () => {
  it('goes to Moves from a swipe, said with its Undo, and from the Un-settle button', async () => {
    const { layer, put } = await Effect.runPromise(stood);
    await run(
      Effect.gen(function* () {
        const app = yield* start(layer);
        send(app, asked('s1', true, true));
        yield* wait();
        expect(model(app).told).toMatchObject({
          title: 'A session',
          settled: true,
        });
        send(app, asked('s2', false, false));
        yield* wait();
        expect(put).toEqual([
          { sessionId: 's1', settled: true },
          { sessionId: 's2', settled: false },
        ]);
        // The Un-settle button says nothing.
        expect(model(app).told).toMatchObject({ settled: true });
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
          connectionId: 'm1',
          sessionId: 's1',
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
