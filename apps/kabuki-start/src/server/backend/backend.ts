import { Context, Effect, Layer } from 'effect';
import { POSTS } from './data.ts';

/*
 * The pretend backend, in the Worker's memory: what a database would hold.
 * Each read is an Effect, as it would be over a network.
 */

/** Each read answers what a page needs, or `undefined` if there is nothing there. */
const backend = {
  posts: Effect.sync(() => ({
    posts: POSTS.map(({ slug, title, summary, date }) => ({
      slug,
      title,
      summary,
      date,
    })),
  })),
  post: (slug: string) =>
    Effect.sync(() => POSTS.find((post) => post.slug === slug)),
};

/** The pretend backend the Loaders read. */
export class Backend extends Context.Service<Backend, typeof backend>()(
  'kabuki-start/Backend',
) {
  /** All of it in memory. */
  static readonly memory = Layer.succeed(Backend, backend);
}
