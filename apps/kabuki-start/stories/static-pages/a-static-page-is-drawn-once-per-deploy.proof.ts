import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** When the server drew the page it sent, and with which build, from its footer. */
const drawn = (cookie?: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}/blog/drawn-once`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });
    const html = await response.text();
    const [, at, build] =
      /Page drawn by the server at ([\d:.]+ UTC), build (\w+)</.exec(html) ??
      [];
    return { status: response.status, at, build };
  });

export default Proof.make({
  title:
    'A static page is drawn once per deploy and then served from the cache',
  description:
    'Once a post has been asked for, three more requests for it, the last with a session cookie, all get that one drawing: same draw time, same build. The first ask may land while a fresh deploy is still spreading, so it only warms the cache. In dev every request is drawn again, which the Proof says instead.',
  prepare: Effect.succeed({}),
  act: () =>
    Effect.gen(function* () {
      yield* drawn();
      yield* Effect.sleep('500 millis');
      const first = yield* drawn();
      yield* Effect.sleep('50 millis');
      const second = yield* drawn();
      const signedIn = yield* drawn('session=Grace');
      return { first, second, signedIn };
    }),
  verify: ({ first, second, signedIn }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `each request answered 200 with a draw time (${first.at}, ${second.at}, ${signedIn.at})`,
        [first, second, signedIn].every(
          (each) => each.status === 200 && each.at !== undefined,
        ),
      );
      if (first.build === 'dev') {
        yield* Proof.assert(
          'in dev, each request is drawn again',
          first.at !== second.at && second.at !== signedIn.at,
        );
        return;
      }
      yield* Proof.assert(
        `the next request got the very same drawing (${first.at}, build ${first.build})`,
        second.at === first.at && second.build === first.build,
      );
      yield* Proof.assert(
        'and so did a signed-in one: a static page is the same for everyone',
        signedIn.at === first.at && signedIn.build === first.build,
      );
    }),
});
