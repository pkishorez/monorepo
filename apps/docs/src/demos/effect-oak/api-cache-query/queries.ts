import { Context, Effect, Schema } from 'effect';
import { Blog, Post, PostDetail, Served, Stats } from '../blog-server/index.js';
import { makeQuery } from './query/index.js';

/*
 * The app's three Queries. Posts reports a clicked post to the app through
 * Reader, a Request: the app keeps which post is open and orders its detail.
 */

/** Whoever opens posts: the app. */
export class Reader extends Context.Service<
  Reader,
  { readonly open: (postId: string) => void }
>()('docs/api-cache-query/Reader') {}

export const PostsQuery = makeQuery({
  name: 'Posts',
  data: Served(Schema.Array(Post)),
  requires: { blog: Blog, reader: Reader },
  fetch: () =>
    Effect.gen(function* () {
      return yield* (yield* Blog).posts;
    }),
  choose: (postId) =>
    Effect.gen(function* () {
      (yield* Reader).open(postId);
    }),
});

export const PostQuery = makeQuery({
  name: 'Post',
  data: Served(PostDetail),
  requires: { blog: Blog },
  fetch: (postId) =>
    Effect.gen(function* () {
      return yield* (yield* Blog).post(postId);
    }),
});

export const StatsQuery = makeQuery({
  name: 'Stats',
  data: Served(Stats),
  requires: { blog: Blog },
  fetch: () =>
    Effect.gen(function* () {
      return yield* (yield* Blog).stats;
    }),
});
