import { Schema } from 'effect';
import { Route } from '../../../../routing/index.ts';

/*
 * A small site with every Render Mode: static pages with and without an
 * Input, a dynamic place read from a cookie, client places, a lazy View,
 * a redirect in the Routes, and a post whose title would close a script.
 */

export const Summary = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
});
export const Post = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  body: Schema.String,
});
export const Viewer = Schema.Struct({ name: Schema.String });
export const Prefs = Schema.Struct({ theme: Schema.String });
export const Activity = Schema.Struct({ events: Schema.Number });
export const Stats = Schema.Struct({ visits: Schema.Number });

export const Routes = Route.tree(
  {
    Home: Route.path('/', {
      metadata: { title: 'Home', description: 'Welcome' },
    }),
    Blog: Route.path(
      '/blog',
      { input: Schema.Array(Summary), metadata: { title: 'Blog' } },
      {
        Index: Route.path('/'),
        Post: Route.path('/:slug', {
          params: { slug: Schema.String },
          input: Post,
          metadata: (_params, post) => ({
            title: post.title,
            openGraph: { title: post.title },
          }),
        }),
      },
    ),
    Account: Route.path(
      '/account',
      { render: 'dynamic', input: Viewer, metadata: { title: 'Account' } },
      {
        Overview: Route.path('/'),
        Settings: Route.path('/settings', { input: Prefs }),
        Activity: Route.path('/activity', {
          render: 'client',
          input: Activity,
        }),
      },
    ),
    Dashboard: Route.path('/dashboard', {
      render: 'client',
      input: Stats,
      metadata: { title: 'Dashboard' },
    }),
    Lab: Route.path('/lab', { metadata: { title: 'Lab' } }),
    Gallery: Route.path('/gallery', { metadata: { title: 'Gallery' } }),
    SignIn: Route.path('/sign-in', { metadata: { title: 'Sign in' } }),
    Sketch: Route.path('/sketch', {
      render: 'client',
      metadata: { title: 'Sketch' },
    }),
  },
  { redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) } },
);
