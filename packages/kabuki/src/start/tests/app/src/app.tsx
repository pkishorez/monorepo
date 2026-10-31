import type { ReactNode } from 'react';
import { View } from '../../../../react/index.ts';
import type { Status } from '../../../../routing/index.ts';
import { Start } from '../../../app/index.ts';
import Document from './document.tsx';
import {
  AccountActivityLive,
  AccountLive,
  AppLive,
  BlogLive,
  BlogPostLive,
  DashboardLive,
  GalleryLive,
  HomeLive,
  LabLive,
  SettingsLive,
  SignInLive,
  SketchLive,
  router,
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

const PostView = View.make(BlogPostLive, ({ props }) =>
  loaded(props.status, (post) => (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  )),
);
const BlogView = View.make(BlogLive, (self) => (
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

const SettingsView = View.make(SettingsLive, ({ props }) =>
  loaded(props.status, (prefs) => <p>theme {prefs.theme}</p>),
);
const ActivityView = View.make(AccountActivityLive, ({ props }) =>
  loaded(props.status, (activity) => <p>{activity.events} events</p>),
);
const AccountView = View.make(AccountLive, (self) => (
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

const HomeView = View.make(HomeLive, () => (
  <>
    <p>home</p>
    <Stamp />
  </>
));
const DashboardView = View.make(DashboardLive, ({ props }) =>
  loaded(props.status, (stats) => <p>{stats.visits} visits</p>),
);
const LabView = View.lazy(LabLive, () => import('./lab.tsx'), {
  id: 'src/lab.tsx',
});
// Its id is the one Start's Vite plugin gives it: its path from the root.
const GalleryView = View.lazy(GalleryLive, () => import('./gallery.tsx'));
const SignInView = View.make(SignInLive, () => <p>sign in</p>);
const SketchView = View.make(SketchLive, () => (
  <div id="sketch">
    <p>the sketch</p>
    <Stamp />
  </div>
));

export const AppView = View.make(AppLive, (self) => {
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

export default Start.app({ router, view: AppView, document: Document });
