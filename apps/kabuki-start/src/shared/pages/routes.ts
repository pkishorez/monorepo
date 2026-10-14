import { Route } from '@kestack/kabuki/routing';
import { App } from './app.ts';

/*
 * The Routes, read down from the root page: every page's place in the URL
 * is its key in the page above, its path joined to theirs. Read once first
 * used, so a page can import them for its Updates.
 */

export const Routes = Route.tree(() => App, {
  // An old address that is never a place: a 308 to the post.
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
  metadata: { meta: [{ property: 'og:site_name', content: 'Kabuki Start' }] },
  notFound: { title: 'Not found · Kabuki Start', robots: 'noindex' },
});

/** Any Route of the site: `Routes.Blog.Post({ slug })` makes one. */
export type Route = typeof Routes.route.Type;

/** A place's dotted name, as the Routes write it: `Blog.Post`. */
export type Place = typeof Routes.place.Type;
