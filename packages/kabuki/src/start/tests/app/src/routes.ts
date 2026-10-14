import { Schema } from 'effect';
import { Route } from '../../../../routing/index.ts';

/*
 * A small site with every Render Mode: static pages with and without data,
 * a dynamic place read from a cookie, client places, lazy Views, a redirect
 * in the Routes, and a post whose title would close a script.
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

export const BlogPost = Route.page({
  path: '/:slug',
  params: { slug: Schema.String },
  data: Post,
  metadata: (_params, post) =>
    post ? { title: post.title, openGraph: { title: post.title } } : {},
}).build({});
export const Blog = Route.page({
  path: '/blog',
  data: Schema.Array(Summary),
  metadata: { title: 'Blog' },
  pages: { Post: BlogPost },
}).build({});

export const Settings = Route.page({ path: '/settings', data: Prefs }).build(
  {},
);
export const AccountActivity = Route.page({
  path: '/activity',
  render: 'client',
  data: Activity,
}).build({});
export const Account = Route.page({
  path: '/account',
  render: 'dynamic',
  data: Viewer,
  metadata: { title: 'Account' },
  pages: { Settings, Activity: AccountActivity },
}).build({});

export const Home = Route.page({
  path: '/',
  metadata: { title: 'Home', description: 'Welcome' },
}).build({});
export const Dashboard = Route.page({
  path: '/dashboard',
  render: 'client',
  data: Stats,
  metadata: { title: 'Dashboard' },
}).build({});
export const Lab = Route.page({
  path: '/lab',
  metadata: { title: 'Lab' },
}).build({});
export const Gallery = Route.page({
  path: '/gallery',
  metadata: { title: 'Gallery' },
}).build({});
export const SignIn = Route.page({
  path: '/sign-in',
  metadata: { title: 'Sign in' },
}).build({});
export const Sketch = Route.page({
  path: '/sketch',
  render: 'client',
  metadata: { title: 'Sketch' },
}).build({});

export const App = Route.page({
  pages: {
    Home,
    Blog,
    Account,
    Dashboard,
    Lab,
    Gallery,
    SignIn,
    Sketch,
  },
}).build({});

export const Routes = Route.tree(App, {
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
});
