import { Schema } from 'effect';
import { Page, Router } from '../../../../routing/index.ts';

/*
 * A small site with every Render Mode: static pages with and without data,
 * a dynamic page read from a cookie, client pages, lazy Views, a redirect
 * in the router, and a post whose title would close a script.
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

export const BlogPost = Page.define({
  path: '/:slug',
  params: { slug: Schema.String },
  data: Post,
  metadata: (_params, post) =>
    post ? { title: post.title, openGraph: { title: post.title } } : {},
});
export const BlogPostLive = BlogPost.build();
export const Blog = Page.define({
  path: '/blog',
  data: Schema.Array(Summary),
  metadata: { title: 'Blog' },
  pages: { Post: BlogPost },
});
export const BlogLive = Blog.build({ pages: { Post: BlogPostLive } });

export const Settings = Page.define({ path: '/settings', data: Prefs });
export const SettingsLive = Settings.build();
export const AccountActivity = Page.define({
  path: '/activity',
  render: 'client',
  data: Activity,
});
export const AccountActivityLive = AccountActivity.build();
export const Account = Page.define({
  path: '/account',
  render: 'dynamic',
  data: Viewer,
  metadata: { title: 'Account' },
  pages: { Settings, Activity: AccountActivity },
});
export const AccountLive = Account.build({
  pages: { Settings: SettingsLive, Activity: AccountActivityLive },
});

export const Home = Page.define({
  path: '/',
  metadata: { title: 'Home', description: 'Welcome' },
});
export const HomeLive = Home.build();
export const Dashboard = Page.define({
  path: '/dashboard',
  render: 'client',
  data: Stats,
  metadata: { title: 'Dashboard' },
});
export const DashboardLive = Dashboard.build();
export const Lab = Page.define({ path: '/lab', metadata: { title: 'Lab' } });
export const LabLive = Lab.build();
export const Gallery = Page.define({
  path: '/gallery',
  metadata: { title: 'Gallery' },
});
export const GalleryLive = Gallery.build();
export const SignIn = Page.define({
  path: '/sign-in',
  metadata: { title: 'Sign in' },
});
export const SignInLive = SignIn.build();
export const Sketch = Page.define({
  path: '/sketch',
  render: 'client',
  metadata: { title: 'Sketch' },
});
export const SketchLive = Sketch.build();

export const App = Page.define({
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
});
export const AppLive = App.build({
  pages: {
    Home: HomeLive,
    Blog: BlogLive,
    Account: AccountLive,
    Dashboard: DashboardLive,
    Lab: LabLive,
    Gallery: GalleryLive,
    SignIn: SignInLive,
    Sketch: SketchLive,
  },
});

export const router = Router.define(App, {
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
  scrollRestoration: true,
});
