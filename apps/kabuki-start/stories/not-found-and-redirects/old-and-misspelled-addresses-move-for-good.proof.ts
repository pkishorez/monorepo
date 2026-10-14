import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One request, its redirect not followed: where it points, as a path and query. */
const get = (path: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, { redirect: 'manual' });
    const location = response.headers.get('location');
    const to = location === null ? null : new URL(location, SITE);
    return {
      path,
      status: response.status,
      to: to && `${to.pathname}${to.search}`,
    };
  });

const CASES = [
  ['/posts/back-is-free', '/blog/back-is-free'],
  ['/posts/drawn-once?ref=feed', '/blog/drawn-once?ref=feed'],
  ['/blog/drawn-once/', '/blog/drawn-once'],
  ['/account/', '/account'],
] as const;

export default Proof.make({
  title: 'An old or misspelled address moves for good to the page it means',
  description:
    "A redirect written in the Routes (/posts/:slug) and a URL not written as its Route is (a trailing slash) are a 308 to the Route's URL, keeping the query.",
  prepare: Effect.succeed({}),
  act: () => Effect.all(CASES.map(([from]) => get(from))),
  verify: (answers) =>
    Effect.gen(function* () {
      for (const [index, { path, status, to }] of answers.entries())
        yield* Proof.assert(
          `${path} → ${status} ${to}`,
          status === 308 && to === CASES[index]![1],
        );
    }),
});
