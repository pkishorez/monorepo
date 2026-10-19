import { Router } from '@kestack/kabuki/routing';
import { App } from './app.ts';

/*
 * The pages' router, read down from the root page once first used, so a
 * page can import it for its Updates. A URL that names no page draws the
 * root's not-found screen and answers 404.
 *
 * It keeps no copies in the Data cache: every page's data is some
 * Account's, and nothing in the browser says another tab, or another app,
 * switched Account before a request does. So Back, like any move, shows
 * data read for whoever is active now, never a copy kept for the Account
 * before. The pages are small and read in process: a move lands within the
 * Router's delay.
 */
export const router = Router.define(() => App, {
  notFound: { title: 'Page not found', robots: 'noindex' },
  cacheSize: 0,
});

export type Route = typeof router.route.Type;
