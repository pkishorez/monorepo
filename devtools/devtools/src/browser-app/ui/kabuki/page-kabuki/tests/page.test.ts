import { Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { History, Runtime } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../../sessions/index.js';
import { Kabuki, KabukiLive, kabukiRoute } from '../index.js';

/*
 * The /kabuki page in memory, on a DevTools that lists what the test
 * says: the Kabuki Session the address names opens while it is live, waits
 * while it is not, and the list is dialed again when its socket closes.
 */

const App = Page.define({ pages: { Kabuki } });
const AppLive = App.build({ pages: { Kabuki: KabukiLive } });
const Root = Router.view(
  Router.define(App),
  View.make(AppLive, () => null),
);

/** A Kabuki Session's Api that never answers: the Inspector waits on it. */
const silent = new Proxy({} as KabukiSessionClient, {
  get: (_, method) => () => (method === 'watch' ? Stream.never : Effect.never),
});

const summary = (name: string, connectedAt = 1): KabukiSessionSummary => ({
  name,
  app: 'Diary',
  environment: 'localhost:5173',
  url: 'http://localhost:5173/',
  origin: 'http://localhost:5173',
  connectedAt,
});

type List = ReadonlyArray<KabukiSessionSummary>;

/** DevTools as the test drives it: each watch is a socket the test may close. */
const fake = Effect.gen(function* () {
  const sockets = yield* Queue.unbounded<Queue.Queue<List | null>>();
  const dialed: Array<string> = [];
  const layer = Layer.succeed(Sessions)({
    watch: Stream.unwrap(
      Effect.gen(function* () {
        const socket = yield* Queue.unbounded<List | null>();
        yield* Queue.offer(sockets, socket);
        return Stream.fromQueue(socket).pipe(
          Stream.takeWhile((list): list is List => list !== null),
        );
      }),
    ),
    dial: (name) => Effect.sync(() => (dialed.push(name), silent)),
  });
  return { sockets, dialed, layer };
});

const settle = Effect.promise(
  () => new Promise((done) => setTimeout(done, 20)),
);
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
const page = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'Kabuki')!;
const inspected = (app: Running<unknown>) =>
  walk(app.snapshot()).some((each) => each.actor === 'RemoteInspector');

const start = (name: string | null, layer: Layer.Layer<Sessions>) =>
  Runtime.start(
    History.make(Root.actor, {
      window: 0,
      input: { route: kabukiRoute(name) },
    }),
    layer,
  );

describe('the /kabuki page', () => {
  it('opens the Kabuki Session the address names once it is live, and waits while it is gone', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fake;
        const app = yield* start('quiet-otter', devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        // Not live until DevTools says it is.
        expect(page(app).state).toEqual({ _tag: 'Away', name: 'quiet-otter' });

        yield* Queue.offer(socket, [summary('brave-fox')]);
        yield* settle;
        expect(page(app).state).toEqual({ _tag: 'Away', name: 'quiet-otter' });
        expect(inspected(app)).toBe(false);

        yield* Queue.offer(socket, [
          summary('brave-fox'),
          summary('quiet-otter'),
        ]);
        yield* settle;
        expect(page(app).state).toEqual({ _tag: 'Open', name: 'quiet-otter' });
        expect(inspected(app)).toBe(true);
        expect(devtools.dialed).toEqual(['quiet-otter']);

        yield* Queue.offer(socket, [summary('brave-fox')]);
        yield* settle;
        expect(page(app).state).toEqual({ _tag: 'Away', name: 'quiet-otter' });
        expect(inspected(app)).toBe(false);
      }),
    ));

  it('reaches a Kabuki Session again when it connects again under the same name', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fake;
        const app = yield* start('quiet-otter', devtools.layer);
        const socket = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(socket, [summary('quiet-otter', 1)]);
        yield* settle;
        yield* Queue.offer(socket, [summary('quiet-otter', 2)]);
        yield* settle;
        expect(devtools.dialed).toEqual(['quiet-otter', 'quiet-otter']);
        expect(inspected(app)).toBe(true);
      }),
    ));

  it('keeps the list while its socket is closed, and dials again', () =>
    run(
      Effect.gen(function* () {
        const devtools = yield* fake;
        const app = yield* start('quiet-otter', devtools.layer);
        const first = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(first, [summary('quiet-otter')]);
        yield* settle;
        yield* Queue.offer(first, null);
        yield* settle;
        expect(page(app).model).toEqual({
          sessions: [summary('quiet-otter')],
          link: 'reconnecting',
        });
        expect(page(app).state).toEqual({ _tag: 'Away', name: 'quiet-otter' });

        const second = yield* Queue.take(devtools.sockets);
        yield* Queue.offer(second, [summary('quiet-otter')]);
        yield* settle;
        expect(page(app).model).toMatchObject({ link: 'live' });
        expect(page(app).state).toEqual({ _tag: 'Open', name: 'quiet-otter' });
      }),
    ));
});
