import { Context, Effect, Layer, Random, Ref, Schema } from 'effect';
import { ARTICLES, FLAKY_POST_ID } from './articles.js';

/*
 * A fake blog API, in the browser: a list of posts, each post's detail and
 * some live stats, each answered after 700 ms of the app's Time. One post
 * fails every other fetch so the Failed and retry path can be seen. Each
 * answer carries the wall-clock time it was served at.
 */

const LATENCY_MS = 700;

export const Post = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  excerpt: Schema.String,
});

export const PostDetail = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
  body: Schema.String,
});

export const Stats = Schema.Struct({
  activeUsers: Schema.Number,
  requestsPerSecond: Schema.Number,
  cacheHitRatePercent: Schema.Number,
});

/** What every answer looks like: the data and when it was served. */
export const Served = <A extends Schema.Top>(data: A) =>
  Schema.Struct({ data, servedAt: Schema.Number });

type Served<A> = { readonly data: A; readonly servedAt: number };

export class Blog extends Context.Service<
  Blog,
  {
    readonly posts: Effect.Effect<
      Served<ReadonlyArray<typeof Post.Type>>,
      string
    >;
    readonly post: (
      id: string,
    ) => Effect.Effect<Served<typeof PostDetail.Type>, string>;
    readonly stats: Effect.Effect<Served<typeof Stats.Type>, string>;
  }
>()('docs/blog-server/Blog') {}

const answer = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.sleep(LATENCY_MS).pipe(
    Effect.andThen(effect),
    Effect.map((data) => ({ data, servedAt: Date.now() })),
  );

export const BlogLive = Layer.effect(
  Blog,
  Effect.gen(function* () {
    const flakyFetches = yield* Ref.make(0);
    return {
      posts: answer(
        Effect.succeed(
          ARTICLES.map(({ id, title, excerpt }) => ({ id, title, excerpt })),
        ),
      ),
      post: (id) =>
        answer(
          Effect.gen(function* () {
            if (id === FLAKY_POST_ID) {
              const count = yield* Ref.updateAndGet(flakyFetches, (n) => n + 1);
              if (count % 2 === 1)
                return yield* Effect.fail(
                  'The connection dropped. Retry to fetch this post again.',
                );
            }
            const article = ARTICLES.find((a) => a.id === id);
            if (!article)
              return yield* Effect.fail(`No post found with id ${id}`);
            const { title, author, body } = article;
            return { id, title, author, body };
          }),
        ),
      stats: answer(
        Effect.all({
          activeUsers: Random.nextIntBetween(80, 140),
          requestsPerSecond: Random.nextIntBetween(900, 1600),
          cacheHitRatePercent: Random.nextIntBetween(86, 99),
        }),
      ),
    };
  }),
);
