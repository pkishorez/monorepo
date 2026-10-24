import { Page, Router } from '@kestack/kabuki/routing';
import { Playground, PlaygroundLive } from './playground.ts';

/*
 * The root page, which only routes, and the one page under it, the
 * Playground, at `/`. Both sides import this: the server to draw it, the
 * browser to run it.
 */

const App = Page.define({
  metadata: { meta: [{ property: 'og:site_name', content: 'Hands' }] },
  pages: { Playground },
});

const AppLive = Page.build(App, { pages: { Playground: PlaygroundLive } });

export const router = Router.define(App, {
  notFound: { title: 'Not found · Hands', robots: 'noindex' },
});

/** Every page's build, for its View. */
export const Pages = { AppLive, PlaygroundLive };
