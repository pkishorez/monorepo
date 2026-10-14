import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One request, its redirect not followed. */
const get = (path: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, { redirect: 'manual' });
    const location = response.headers.get('location');
    return {
      path,
      status: response.status,
      to: location === null ? null : new URL(location, SITE).pathname,
      cache: response.headers.get('cache-control'),
    };
  });

export default Proof.make({
  title: 'A signed-out visitor asking for the account is sent to sign in',
  description:
    "The account's Loader finds no session cookie and fails with a Redirect: a 302, not a 308, since it depends on who asks, and never cached.",
  prepare: Effect.succeed({}),
  act: () => Effect.all([get('/account'), get('/account/settings')]),
  verify: (answers) =>
    Effect.gen(function* () {
      for (const { path, status, to, cache } of answers) {
        yield* Proof.assert(`${path} answers 302 (${status})`, status === 302);
        yield* Proof.assert(`to /sign-in (${to})`, to === '/sign-in');
        yield* Proof.assert(
          `and is never kept (${cache})`,
          cache === 'private, no-store',
        );
      }
    }),
});
