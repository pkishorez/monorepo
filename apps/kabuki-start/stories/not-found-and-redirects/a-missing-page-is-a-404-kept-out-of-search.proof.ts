import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One page as the server sends it. */
const get = (path: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, { redirect: 'manual' });
    const html = await response.text();
    return { path, status: response.status, html };
  });

export default Proof.make({
  title: 'A missing page is a 404 that search engines are told to skip',
  description:
    'An address no place matches, and a post or docs page whose Loader finds nothing, all draw the not-found page with a 404 and robots noindex.',
  prepare: Effect.succeed({}),
  act: () =>
    Effect.all([get('/nowhere'), get('/blog/missing'), get('/docs/nope')]),
  verify: (pages) =>
    Effect.gen(function* () {
      for (const page of pages) {
        yield* Proof.assert(
          `${page.path} answers 404 (${page.status})`,
          page.status === 404,
        );
        yield* Proof.assert(
          'with the not-found page, titled "Not found"',
          page.html.includes('data-testid="place:NotFound"') &&
            page.html.includes('<title>Not found · Kabuki Start</title>'),
        );
        yield* Proof.assert(
          'and noindex',
          page.html.includes('<meta name="robots" content="noindex"'),
        );
      }
    }),
});
