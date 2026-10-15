import { Clock, Effect, Random } from 'effect';
import type { Duration } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start/server';
import type { WorkerEnv } from '../infra/index.ts';
import { Backend } from './backend/index.ts';
import { Routes } from '../shared/index.ts';

/*
 * One Loader per page with data, most of them slow on purpose, so each case
 * has something to show: a post takes a second, a team longer than its
 * member, a slow page a second and a half, the feed most of a second, and
 * /flaky breaks on a coin toss.
 */

/**
 * What `query` reads from the backend after `wait`, or not found if it
 * finds nothing, stamped with when it started and when it answered.
 */
const read = <A extends object, E, R>(
  query: (db: Backend['Service']) => Effect.Effect<A | undefined, E, R>,
  wait: Duration.Input = 0,
) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    yield* Effect.sleep(wait);
    const found = yield* query(yield* Backend);
    if (found === undefined) return yield* Route.notFound();
    return { ...found, startedAt, loadedAt: yield* Clock.currentTimeMillis };
  });

const loaders = Routes.loaders({
  Blog: () => read((db) => db.posts),
  'Blog.Post': ({ slug }) => {
    if (slug === 'broken')
      return Effect.sleep('1 second').pipe(
        Effect.andThen(Effect.die(new Error('this post always breaks'))),
      );
    if (slug === 'moved')
      return Effect.fail(
        Route.redirect(Routes.Blog.Post({ slug: 'pages-are-actors' })),
      );
    return read((db) => db.post(slug), '1 second');
  },
  Teams: ({ team }) => read((db) => db.team(team), '1200 millis'),
  'Teams.Member': ({ team, member }) =>
    read((db) => db.member(team, member), '700 millis'),
  Feed: () => read((db) => db.feed, '900 millis'),
  Search: ({ q }) => read((db) => db.search(q ?? ''), '600 millis'),
  Notes: () => read((db) => db.notes, '800 millis'),
  'Preload.Slow': ({ n }) => read(() => Effect.succeed({ n }), '1500 millis'),
  Flaky: () =>
    Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis;
      yield* Effect.sleep('1 second');
      const luck = yield* Random.next;
      if (luck < 0.5)
        return yield* Effect.die(new Error('the coin came up tails'));
      return { luck, startedAt, loadedAt: yield* Clock.currentTimeMillis };
    }),
});

export default Start.layers<WorkerEnv>()
  .instance(() => Backend.memory)
  .loaders(loaders);
