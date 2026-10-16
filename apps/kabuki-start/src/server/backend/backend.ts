import { Context, Effect, Layer } from 'effect';
import { FEED, POSTS, TEAMS } from './data.ts';

/*
 * The pretend backend, in the Worker's memory: what a database would hold.
 * Each read is an Effect, as it would be over a network.
 */

const summary = ({ slug, title, summary, date }: (typeof POSTS)[number]) => ({
  slug,
  title,
  summary,
  date,
});

/** How many times each slow page was loaded: a Loader that runs again counts up. */
const slowLoads = new Map<number, number>();

/** Each read answers what a page needs, or `undefined` if there is nothing there. */
const backend = {
  posts: Effect.sync(() => ({ posts: POSTS.map(summary) })),
  post: (slug: string) =>
    Effect.sync(() => POSTS.find((post) => post.slug === slug)),
  team: (slug: string) =>
    Effect.sync(() => {
      const team = TEAMS.find((each) => each.slug === slug);
      return (
        team && {
          slug: team.slug,
          name: team.name,
          members: team.members.map(({ handle, name, role }) => ({
            handle,
            name,
            role,
          })),
        }
      );
    }),
  member: (team: string, handle: string) =>
    Effect.sync(() =>
      TEAMS.find((each) => each.slug === team)?.members.find(
        (member) => member.handle === handle,
      ),
    ),
  search: (q: string) =>
    Effect.sync(() => ({
      q,
      hits: POSTS.filter(
        (post) =>
          q === '' ||
          `${post.title} ${post.summary}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ).map(summary),
    })),
  feed: Effect.sync(() => ({ items: FEED })),
  slow: (n: number) =>
    Effect.sync(() => {
      const loads = (slowLoads.get(n) ?? 0) + 1;
      slowLoads.set(n, loads);
      return { n, loads };
    }),
};

/** The pretend backend the Loaders read. */
export class Backend extends Context.Service<Backend, typeof backend>()(
  'kabuki-start/Backend',
) {
  /** All of it in memory. */
  static readonly memory = Layer.succeed(Backend, backend);
}
