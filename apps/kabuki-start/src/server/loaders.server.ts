import { Clock, Effect } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start/server';
import type { WorkerEnv } from '../infra/index.ts';
import { Backend } from './backend/index.ts';
import { Routes } from '../shared/index.ts';

/*
 * One Loader per place with an Input. Some are slow on purpose, and one
 * fails half the time, so the pending and failed screens have something
 * to show: a post takes a second, and so does /flaky, which then breaks
 * on a coin toss. The post `broken` always breaks.
 */

/**
 * What `query` reads from the backend, or not found if it finds nothing.
 * The answer is stamped with when it was read: the pages show it, to tell
 * an Input that came with the page from one the browser fetched.
 */
const read = <A extends object, E, R>(
  query: (db: Backend['Service']) => Effect.Effect<A | undefined, E, R>,
) =>
  Effect.gen(function* () {
    const found = yield* query(yield* Backend);
    if (found === undefined) return yield* Route.notFound();
    return { ...found, loadedAt: yield* Clock.currentTimeMillis };
  });

/** A slow network, made up. */
const slowly = Effect.sleep('1 second');

const loaders = Routes.loaders({
  Blog: () => read((db) => db.posts),
  'Blog.Post': ({ slug }) =>
    slowly.pipe(
      Effect.andThen(
        slug === 'broken'
          ? Effect.die(new Error('this post always breaks'))
          : read((db) => db.post(slug)),
      ),
    ),
  Flaky: () =>
    Effect.gen(function* () {
      yield* slowly;
      const luck = Math.random();
      if (luck < 0.5)
        return yield* Effect.die(new Error('the coin came up tails'));
      return { luck, loadedAt: yield* Clock.currentTimeMillis };
    }),
});

export default Start.layers<WorkerEnv>()
  .instance(() => Backend.memory)
  .loaders(loaders);
