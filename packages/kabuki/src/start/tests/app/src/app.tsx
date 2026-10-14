import type { ReactNode } from 'react';
import { View } from '../../../../react/index.ts';
import { Route, Router } from '../../../../routing/index.ts';
import type { Status } from '../../../../routing/index.ts';
import { Start } from '../../../common/index.ts';
import Document from './document.tsx';
import {
  Account,
  AccountActivity,
  App,
  Blog,
  BlogPost,
  Dashboard,
  Gallery,
  Home,
  Lab,
  Routes,
  Settings,
  SignIn,
  Sketch,
} from './routes.ts';
import './app.css';

/** Who drew it, as `Start.useDrawn()` says. */
function Stamp() {
  const drawn = Start.useDrawn();
  if (!drawn) return <p>not served</p>;
  return (
    <p className="stamp">
      {`drawn by the ${drawn.hydrated ? 'server' : 'browser'}, ${drawn.build ?? 'dev'}`}
    </p>
  );
}

/** A page's data, or what it says while there is none. */
const loaded = <D,>(status: Status<D>, ready: (data: D) => ReactNode) => {
  switch (status._tag) {
    case 'Loading':
      return <p>loading…</p>;
    case 'Failed':
      return <p>{status.notFound ? 'not found' : `broke: ${status.reason}`}</p>;
    case 'Ready':
      return ready(status.data);
  }
};

const PostView = Route.view(BlogPost, ({ props }) =>
  loaded(props.status, (post) => (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  )),
);
const BlogView = Route.view(Blog, (self) => (
  <section>
    {loaded(self.props.status, (list) => (
      <p>{list.length} posts</p>
    ))}
    {self.children.Post ? (
      <PostView instance={self.children.Post} />
    ) : (
      <p>the index</p>
    )}
  </section>
));

const SettingsView = Route.view(Settings, ({ props }) =>
  loaded(props.status, (prefs) => <p>theme {prefs.theme}</p>),
);
const ActivityView = Route.view(AccountActivity, ({ props }) =>
  loaded(props.status, (activity) => <p>{activity.events} events</p>),
);
const AccountView = Route.view(Account, (self) => (
  <section>
    {loaded(self.props.status, (viewer) => (
      <p>signed in as {viewer.name}</p>
    ))}
    <div id="account-outlet">
      {self.children.Settings && (
        <SettingsView instance={self.children.Settings} />
      )}
      {self.children.Activity && (
        <ActivityView instance={self.children.Activity} />
      )}
      {!self.props.route.page && <p>the overview</p>}
    </div>
  </section>
));

const HomeView = Route.view(Home, () => (
  <>
    <p>home</p>
    <Stamp />
  </>
));
const DashboardView = Route.view(Dashboard, ({ props }) =>
  loaded(props.status, (stats) => <p>{stats.visits} visits</p>),
);
const LabView = Route.view(
  Lab,
  View.lazy(() => import('./lab.tsx'), { id: 'src/lab.tsx' }),
);
// Its id is the one Start's Vite plugin gives it: its path from the root.
const GalleryView = Route.view(
  Gallery,
  View.lazy(() => import('./gallery.tsx')),
);
const SignInView = Route.view(SignIn, () => <p>sign in</p>);
const SketchView = Route.view(Sketch, () => (
  <div id="sketch">
    <p>the sketch</p>
    <Stamp />
  </div>
));

const AppView = Route.view(App, (self) => {
  const { children: at, props } = self;
  return (
    <main id="app">
      {at.Home && <HomeView instance={at.Home} />}
      {at.Blog && <BlogView instance={at.Blog} />}
      {at.Account && <AccountView instance={at.Account} />}
      {at.Dashboard && <DashboardView instance={at.Dashboard} />}
      {at.Lab && <LabView instance={at.Lab} />}
      {at.Gallery && <GalleryView instance={at.Gallery} />}
      {at.SignIn && <SignInView instance={at.SignIn} />}
      {at.Sketch && <SketchView instance={at.Sketch} />}
      {props.route.notFound !== null && (
        <p>nothing at {props.route.notFound}</p>
      )}
    </main>
  );
});

/** The app alone, as a test or a story runs it. */
export const app = Router.app(Routes, AppView);

export default Start.app(app, { document: Document });
