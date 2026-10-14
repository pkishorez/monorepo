import { Schema } from 'effect';
import { Actor } from '../../../../core/index.ts';
import { View } from '../../../../react/index.ts';
import { Router } from '../../../../routing/index.ts';
import { Start } from '../../../common/index.ts';
import Document from './document.tsx';
import { Routes } from './routes.ts';
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

const BlogActor = (() => {
  const posts = Routes.Blog.outlet({
    Index: (_props) => <p>the index</p>,
    Post: (_props, post) => (
      <article>
        <h1>{post.title}</h1>
        <p>{post.body}</p>
      </article>
    ),
  });
  const actor = Actor.make('Blog', {
    input: Routes.Blog.input,
    props: Routes.Blog.props,
    model: Schema.Struct({ count: Schema.Number }),
  }).build({
    init: (list) => ({ model: { count: list.length } }),
    children: posts.children,
    invoke: posts.invoke,
  });
  return {
    actor,
    view: View.make(actor, (self) => (
      <section>
        <p>{self.model.count} posts</p>
        <posts.View of={self} />
      </section>
    )),
  };
})();

const AccountActor = (() => {
  const sections = Routes.Account.outlet({
    Overview: () => <p>the overview</p>,
    Settings: (_props, prefs) => <p>theme {prefs.theme}</p>,
    Activity: (_props, activity) => <p>{activity.events} events</p>,
  });
  const actor = Actor.make('Account', {
    input: Routes.Account.input,
    props: Routes.Account.props,
    model: Schema.Struct({ name: Schema.String }),
  }).build({
    init: (viewer) => ({ model: { name: viewer.name } }),
    children: sections.children,
    invoke: sections.invoke,
  });
  return {
    actor,
    view: View.make(actor, (self) => (
      <section>
        <p>signed in as {self.model.name}</p>
        <div id="account-outlet">
          <sections.View of={self} />
        </div>
      </section>
    )),
  };
})();

export const LabActor = Actor.make('Lab', { props: Routes.Lab.props }).build(
  {},
);
export const GalleryActor = Actor.make('Gallery', {
  props: Routes.Gallery.props,
}).build({});

const pages = Routes.outlet({
  Home: () => (
    <>
      <p>home</p>
      <Stamp />
    </>
  ),
  Blog: BlogActor,
  Account: AccountActor,
  Dashboard: (_props, stats) => <p>{stats.visits} visits</p>,
  Lab: {
    actor: LabActor,
    view: View.lazy(() => import('./lab.tsx'), { id: 'src/lab.tsx' }),
  },
  // Its id is the one Start's Vite plugin gives it: its path from the root.
  Gallery: {
    actor: GalleryActor,
    view: View.lazy(() => import('./gallery.tsx')),
  },
  SignIn: () => <p>sign in</p>,
  Sketch: () => (
    <div id="sketch">
      <p>the sketch</p>
      <Stamp />
    </div>
  ),
  NotFound: ({ path }) => <p>nothing at {path}</p>,
});

const AppActor = Actor.make('App', { props: Routes.props }).build({
  children: pages.children,
  invoke: pages.invoke,
});

const App = {
  actor: AppActor,
  view: View.make(AppActor, (self) => (
    <main id="app">
      <pages.View of={self} />
    </main>
  )),
};

/** The app alone, as a test or a story runs it. */
export const app = Router.app(Routes, App);

export default Start.app(app, { document: Document });
