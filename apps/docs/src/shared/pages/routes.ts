import { Router } from '@kestack/kabuki/routing';
import { App } from './app.ts';

/*
 * The router, read down from the root page. Scroll restoration as TanStack
 * Start does it: the window is kept per history entry and put back on Back.
 */

export const router = Router.define(App, {
  notFound: { title: 'Not found', robots: 'noindex' },
  scrollRestoration: true,
});

/** Any Route of the site: `router.Kabuki.Doc({ slug })` makes one. */
export type Route = typeof router.route.Type;
