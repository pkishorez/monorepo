import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One page as the server sends it, before any script runs. */
const get = (path: string, cookie?: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });
    const html = await response.text();
    return { path, status: response.status, html };
  });

/** Whether both places' badges say the server drew them with the Input that came with the page. */
const both = (
  html: string,
  parent: string,
  child: string,
  mode: string,
  childMode = mode,
) =>
  html.includes(
    `data-place="${parent}" data-mode="${mode}" data-drawn="server" data-input="server"`,
  ) &&
  html.includes(
    `data-place="${child}" data-mode="${childMode}" data-drawn="server" data-input="server"`,
  );

export default Proof.make({
  title: 'A nested page arrives with the Input of every place it names',
  description:
    "A URL names a place and the places around it; their Loaders run at once and the server draws them all: the docs' index with a docs page, the blog's list with a post, the account with its settings.",
  prepare: Effect.succeed({}),
  act: () =>
    Effect.all([
      get('/docs/loaders'),
      get('/blog/drawn-once'),
      get('/account/settings', 'session=Grace'),
    ]),
  verify: ([docs, blog, settings]) =>
    Effect.gen(function* () {
      for (const page of [docs, blog, settings])
        yield* Proof.assert(
          `${page.path} answers 200 (${page.status})`,
          page.status === 200,
        );

      yield* Proof.assert(
        '/docs/loaders: the docs and the page are both drawn by the server with their Inputs',
        both(docs.html, 'Docs', 'Docs.Page', 'static'),
      );
      yield* Proof.assert(
        "the page's text is drawn, and the index of pages came with it in the saved History",
        docs.html.includes('Routes.loaders is checked by type') &&
          docs.html.includes('"title":"Render Modes"'),
      );

      yield* Proof.assert(
        '/blog/drawn-once: the list and the post are both drawn by the server with their Inputs',
        both(blog.html, 'Blog', 'Blog.Post', 'static'),
      );
      yield* Proof.assert(
        "the post's text is drawn, and the list of posts came with it in the saved History",
        blog.html.includes('Its Loader is handed its params') &&
          blog.html.includes('"title":"Back is free"'),
      );

      yield* Proof.assert(
        '/account/settings: the account and the settings are both drawn for Grace with their Inputs',
        both(settings.html, 'Account', 'Account.Settings', 'dynamic'),
      );
      yield* Proof.assert(
        "Grace's name and her email are both in it",
        settings.html.includes('data-testid="viewer">Grace<') &&
          settings.html.includes('grace@example.com'),
      );
    }),
});
