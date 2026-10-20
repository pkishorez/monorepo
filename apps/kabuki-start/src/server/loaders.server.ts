import { Effect } from 'effect';
import type { Duration } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start/server';
import { Backend } from './backend/index.ts';
import { router } from '../shared/index.ts';

/*
 * One Loader per page with data, most of them slow on purpose, so each case
 * has something to show: a post takes a second, a team longer than its
 * member, a slow page a second and a half, the feed most of a second.
 */

/** What `query` reads from the backend after `wait`, or not found if it finds nothing. */
const read = <A extends object, E, R>(
  query: (db: Backend['Service']) => Effect.Effect<A | undefined, E, R>,
  wait: Duration.Input = 0,
) =>
  Effect.gen(function* () {
    yield* Effect.sleep(wait);
    const found = yield* query(yield* Backend);
    if (found === undefined) return yield* Page.notFound();
    return found;
  });

const loaders = router.loaders({
  Blog: () => read((db) => db.posts),
  'Blog.Post': ({ slug }) => {
    if (slug === 'broken')
      return Effect.sleep('1 second').pipe(
        Effect.andThen(Effect.die(new Error('this post always breaks'))),
      );
    if (slug === 'moved')
      return Effect.fail(
        Page.redirect(router.Blog.Post({ slug: 'pages-are-actors' })),
      );
    return read((db) => db.post(slug), '1 second');
  },
  Teams: ({ team }) => read((db) => db.team(team), '1200 millis'),
  'Teams.Member': ({ team, member }) =>
    read((db) => db.member(team, member), '700 millis'),
  Feed: () => read((db) => db.feed, '900 millis'),
  Search: ({ q }) => read((db) => db.search(q ?? ''), '600 millis'),
  'Preload.Slow': ({ n }) => read((db) => db.slow(n), '1500 millis'),
});

export default Start.server({ layer: Backend.memory }).loaders(loaders);
