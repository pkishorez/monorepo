import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The account as the server draws it for whoever the cookie says. */
const account = (name: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}/account`, {
      redirect: 'manual',
      headers: { cookie: `session=${name}` },
    });
    const html = await response.text();
    return {
      name,
      status: response.status,
      cache: response.headers.get('cache-control'),
      viewer: /data-testid="viewer">([^<]*)</.exec(html)?.[1],
      drawnHere: html.includes(
        'data-place="Account" data-mode="dynamic" data-drawn="server" data-input="server"',
      ),
    };
  });

export default Proof.make({
  title: 'Each signed-in person gets an account page drawn for them',
  description:
    'A dynamic place is drawn for every request, from the cookie it carries: Grace and Ada each see their own name in the HTML, and neither page is kept.',
  prepare: Effect.succeed({}),
  act: () => Effect.all([account('Grace'), account('Ada')]),
  verify: (pages) =>
    Effect.gen(function* () {
      for (const page of pages) {
        yield* Proof.assert(
          `for ${page.name}: 200 (${page.status})`,
          page.status === 200,
        );
        yield* Proof.assert(
          `signed in as ${page.viewer}`,
          page.viewer === page.name,
        );
        yield* Proof.assert(
          'drawn by the server with its Input',
          page.drawnHere,
        );
        yield* Proof.assert(
          `never kept (${page.cache})`,
          page.cache === 'private, no-store',
        );
      }
    }),
});
