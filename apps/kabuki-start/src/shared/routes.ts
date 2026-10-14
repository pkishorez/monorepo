import { Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import type { Metadata } from '@kestack/kabuki/routing';

/*
 * Every place of the site, once: its path, the Input its Loader gives it,
 * and how it is first drawn. Static is the default; a place inherits its
 * parent's Render Mode and may only be drawn later than it.
 */

/** Where the site is published: every canonical URL is under it. */
const SITE = 'https://start.kishore.app';

/** When its Loader ran, in milliseconds since the epoch: every Input says, and every page shows it. */
const loaded = { loadedAt: Schema.Number };

const PostList = Schema.Struct({
  ...loaded,
  posts: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      title: Schema.String,
      summary: Schema.String,
      date: Schema.String,
    }),
  ),
});
const Post = Schema.Struct({
  ...loaded,
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  date: Schema.String,
  body: Schema.Array(Schema.String),
});
const Luck = Schema.Struct({ ...loaded, luck: Schema.Number });

/** A page's Metadata: its title, what it is about, and the one URL it is known by. */
const about = (
  path: string,
  title: string,
  description: string,
  openGraph?: Metadata['openGraph'],
): Metadata => ({
  title: `${title} · Kabuki Start`,
  description,
  canonical: `${SITE}${path}`,
  openGraph: {
    title,
    description,
    url: `${SITE}${path}`,
    type: 'website',
    ...openGraph,
  },
});

export const Routes = Route.tree(
  {
    Home: Route.path('/', {
      metadata: about(
        '/',
        'Home',
        'Pending and failed screens, on a few slow pages.',
      ),
    }),
    Blog: Route.path(
      '/blog',
      {
        input: PostList,
        metadata: about(
          '/blog',
          'Blog',
          'Notes on drawing pages from their Loaders.',
        ),
      },
      {
        Index: Route.path('/'),
        Post: Route.path('/:slug', {
          params: { slug: Schema.String },
          input: Post,
          metadata: ({ slug }, post) =>
            about(`/blog/${slug}`, post.title, post.summary, {
              type: 'article',
            }),
        }),
      },
    ),
    // A client place that takes its time and fails half the time.
    Flaky: Route.path('/flaky', {
      render: 'client',
      input: Luck,
      metadata: about('/flaky', 'Flaky', 'A page that fails half the time.'),
    }),
  },
  {
    // An old address that is never a place: a 308 to the post.
    redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
    metadata: { meta: [{ property: 'og:site_name', content: 'Kabuki Start' }] },
    notFound: { title: 'Not found · Kabuki Start', robots: 'noindex' },
  },
);

/** Any Route of the site: `Routes.Blog.Post({ slug })` makes one. */
export type Route = typeof Routes.route.Type;

/** A place's dotted name, as the Routes write it: `Blog.Post`. */
export type Place = typeof Routes.place.Type;
