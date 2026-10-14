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
const DocIndex = Schema.Struct({
  ...loaded,
  pages: Schema.Array(
    Schema.Struct({ slug: Schema.String, title: Schema.String }),
  ),
});
const DocPage = Schema.Struct({
  ...loaded,
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  body: Schema.Array(Schema.String),
});
const Viewer = Schema.Struct({ ...loaded, name: Schema.String });
const Prefs = Schema.Struct({
  ...loaded,
  email: Schema.String,
  newsletter: Schema.Boolean,
  language: Schema.String,
});
const Activity = Schema.Struct({
  ...loaded,
  events: Schema.Array(
    Schema.Struct({ what: Schema.String, ago: Schema.String }),
  ),
});
const Stats = Schema.Struct({
  ...loaded,
  visits: Schema.Array(Schema.Number),
  signups: Schema.Number,
  orders: Schema.Number,
  reports: Schema.Array(
    Schema.Struct({ id: Schema.String, title: Schema.String }),
  ),
});
const Report = Schema.Struct({
  ...loaded,
  id: Schema.String,
  title: Schema.String,
  rows: Schema.Array(
    Schema.Struct({ label: Schema.String, value: Schema.Number }),
  ),
});
const Product = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  price: Schema.Number,
});
const Products = Schema.Struct({
  ...loaded,
  products: Schema.Array(Product),
});
const Cart = Schema.Struct({
  ...loaded,
  items: Schema.Array(
    Schema.Struct({ ...Product.fields, quantity: Schema.Number }),
  ),
});

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

/** A page for one user: never in search. */
const own = (title: string): Metadata => ({
  title: `${title} · Kabuki Start`,
  robots: 'noindex',
});

export const Routes = Route.tree(
  {
    Home: Route.path('/', {
      metadata: about(
        '/',
        'Home',
        'A small site with a page for every Render Mode.',
      ),
    }),
    About: Route.path('/about', {
      metadata: about(
        '/about',
        'About',
        'What this site shows, and how to read each page.',
        { type: 'article', image: `${SITE}/og.png` },
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
    Docs: Route.path(
      '/docs',
      {
        input: DocIndex,
        metadata: about(
          '/docs',
          'Docs',
          'How the Routes, Loaders and Render Modes fit.',
        ),
      },
      {
        Index: Route.path('/'),
        // Before `/:page`, so `/docs/playground` is the playground.
        Playground: Route.path('/playground', {
          render: 'client',
          metadata: about(
            '/docs/playground',
            'Playground',
            'Read any URL as a Route, in the browser.',
          ),
        }),
        Page: Route.path('/:page', {
          params: { page: Schema.String },
          input: DocPage,
          metadata: ({ page }, doc) =>
            about(`/docs/${page}`, doc.title, doc.summary),
        }),
      },
    ),
    SignIn: Route.path('/sign-in', {
      metadata: about('/sign-in', 'Sign in', 'Sign in to see your account.'),
    }),
    Account: Route.path(
      '/account',
      { render: 'dynamic', input: Viewer, metadata: own('Account') },
      {
        Overview: Route.path('/'),
        Settings: Route.path('/settings', {
          input: Prefs,
          metadata: own('Settings'),
        }),
        Activity: Route.path('/activity', {
          render: 'client',
          input: Activity,
          metadata: own('Activity'),
        }),
      },
    ),
    Dashboard: Route.path(
      '/dashboard',
      { render: 'client', input: Stats, metadata: own('Dashboard') },
      {
        Overview: Route.path('/'),
        Report: Route.path('/reports/:id', {
          params: { id: Schema.String },
          input: Report,
          metadata: (_params, report) => own(report.title),
        }),
      },
    ),
    Shop: Route.path(
      '/shop',
      {
        input: Products,
        metadata: about('/shop', 'Shop', 'A few things to put in a cart.'),
      },
      {
        Index: Route.path('/'),
        Cart: Route.path('/cart', {
          render: 'dynamic',
          input: Cart,
          metadata: own('Cart'),
        }),
      },
    ),
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
