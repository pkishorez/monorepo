import { Router } from '@kestack/kabuki/routing';
import { App } from './app.ts';

/*
 * The router, read down from the root page: every page's place in the URL
 * is its key in the page above, its path joined to theirs. Read once first
 * used, so a page can import it for its Updates. Scroll restoration as
 * TanStack Start does it: the window and every element scrolled are kept
 * per history entry and put back on Back, a reload too, and what stays on
 * the page keeps where it was.
 */

export const router = Router.define(() => App, {
  // An old address that is never a place: a 308 to the post.
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
  notFound: { title: 'Not found · Kabuki Start', robots: 'noindex' },
  scrollRestoration: true,
});

/** Any Route of the site: `router.Blog.Post({ slug })` makes one. */
export type Route = typeof router.route.Type;

/** A place's dotted name, as the router writes it: `Blog.Post`. */
export type Place = typeof router.place.Type;
