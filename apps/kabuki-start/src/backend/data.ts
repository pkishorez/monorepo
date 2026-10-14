/*
 * What the pretend backend holds: a few posts, docs pages, products and
 * reports, the same for everyone, written here so the demo needs no database.
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

export const DOCS = [
  {
    slug: 'routes',
    title: 'Routes',
    summary: 'Every place of the app, once.',
    body: [
      'Route.tree lists every place with its path, params, Input and Render Mode.',
      'The same definition reads a URL into a Route and writes it back, so a link can never point nowhere.',
    ],
  },
  {
    slug: 'loaders',
    title: 'Loaders',
    summary: 'One server function per place with an Input.',
    body: [
      'Routes.loaders is checked by type: one Loader per place that declares an Input, and no other.',
      'A Loader fails with Route.notFound() or Route.redirect(route), and Start answers with a 404 or a redirect.',
    ],
  },
  {
    slug: 'render-modes',
    title: 'Render Modes',
    summary: 'Static, dynamic or client: where a place is first drawn.',
    body: [
      'Static places are drawn once per deploy and cached; dynamic ones for each request; client ones in the browser alone.',
      'A place can only be drawn later than the place that holds it.',
    ],
  },
] as const;

export const PRODUCTS = [
  { id: 'mug', name: 'Enamel mug', price: 18 },
  { id: 'notebook', name: 'Dot-grid notebook', price: 12 },
  { id: 'poster', name: 'Route tree poster', price: 30 },
  { id: 'stickers', name: 'Sticker sheet', price: 6 },
] as const;

export const REPORTS = [
  {
    id: 'traffic',
    title: 'Traffic by page',
    rows: [
      ['/', 4210],
      ['/blog', 2380],
      ['/docs', 1904],
      ['/shop', 811],
    ],
  },
  {
    id: 'signups',
    title: 'Sign-ups by week',
    rows: [
      ['Week 38', 42],
      ['Week 39', 57],
      ['Week 40', 61],
      ['Week 41', 73],
    ],
  },
  {
    id: 'orders',
    title: 'Orders by product',
    rows: [
      ['Enamel mug', 120],
      ['Dot-grid notebook', 98],
      ['Route tree poster', 31],
      ['Sticker sheet', 207],
    ],
  },
] as const;

/** Visits per day over the last two weeks. */
export const VISITS = [
  310, 342, 298, 401, 455, 389, 362, 420, 478, 512, 467, 530, 588, 610,
] as const;
