/*
 * What the pretend backend holds: a few posts, the same for everyone,
 * written here so the demo needs no database.
 */

export const POSTS = [
  {
    slug: 'drawn-once',
    title: 'Drawn once, per deploy',
    summary: 'Why a static page is drawn on its first visit and kept.',
    date: '2026-09-02',
    body: [
      'A static place is the same for everyone until the next deploy, so the Worker draws it once per data center and keeps it in the Cloudflare Cache under the build id.',
      'Its Loader is handed its params and nothing else: no cookie, no header. Whatever it returns cannot depend on who asked.',
      'The next deploy has a new build id, so every page is drawn again on its first visit.',
    ],
  },
  {
    slug: 'loaders-at-once',
    title: 'Every Loader at once',
    summary: 'A URL names its places, and their Loaders run together.',
    date: '2026-09-16',
    body: [
      "A Loader never sees its parent's Input, so no Loader waits on another. For /docs/routes the docs index and the routes page are loaded together.",
      'The browser does the same after a click: one request to /_kabuki/load asks for every place the move needs.',
    ],
  },
  {
    slug: 'back-is-free',
    title: 'Back is free',
    summary: 'Each history entry keeps the Inputs of its places.',
    date: '2026-10-01',
    body: [
      'The Router keeps every entry with the Inputs its places were drawn from. Back and Forward draw them again without asking the server.',
      'Open the network panel, click through a few posts, then press Back: no request.',
    ],
  },
] as const;
