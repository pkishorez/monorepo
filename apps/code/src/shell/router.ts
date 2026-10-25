import { Router } from '@kestack/kabuki/routing';
import { Shell } from './actor.ts';

/*
 * The router, read down from the root page: every place the app has, and
 * its title when the URL names none. Scroll is kept per history entry and
 * put back on Back and Forward; on a new entry the page's column and a
 * session's transcript start afresh, at the top or, for a transcript, at
 * its bottom, rather than where the page before was scrolled.
 */

export const router = Router.define(Shell, {
  notFound: { title: 'Not found · code', robots: 'noindex' },
  scrollRestoration: true,
  scrollRestorationBehavior: 'instant',
  scrollToTopSelectors: [
    '[data-scroll-restoration-id="page"]',
    '[data-scroll-restoration-id="transcript"]',
  ],
});
