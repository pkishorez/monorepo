import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One page as the server sends it, before any script runs. */
const get = (path: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, { redirect: 'manual' });
    return { path, status: response.status, html: await response.text() };
  });

export default Proof.make({
  title: 'A static page arrives as whole HTML, its Input already in it',
  description:
    'Home has no Input; the blog lists its posts from its Loader. Both come drawn by the server: the content is in the HTML a crawler or a script-less browser reads.',
  prepare: Effect.succeed({}),
  act: () => Effect.all([get('/'), get('/about'), get('/blog')]),
  verify: ([home, about, blog]) =>
    Effect.gen(function* () {
      for (const page of [home, about, blog])
        yield* Proof.assert(
          `${page.path} answers 200 (${page.status})`,
          page.status === 200,
        );
      yield* Proof.assert(
        'Home is drawn by the server, with no Input',
        home.html.includes(
          'data-place="Home" data-mode="static" data-drawn="server" data-input="none"',
        ),
      );
      yield* Proof.assert(
        'About is drawn by the server',
        about.html.includes('data-testid="place:About"'),
      );
      for (const title of [
        'Drawn once, per deploy',
        'Every Loader at once',
        'Back is free',
      ])
        yield* Proof.assert(
          `the blog's HTML lists "${title}"`,
          blog.html.includes(title),
        );
      yield* Proof.assert(
        'and says the list came with the page',
        blog.html.includes(
          'data-place="Blog" data-mode="static" data-drawn="server" data-input="server"',
        ),
      );
    }),
});
