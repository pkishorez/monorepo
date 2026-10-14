import { Clock, Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { Failed, Layout, enter } from './components/index.ts';
import Document from './document.tsx';
import { Blog } from './pages/blog/index.ts';
import { Flaky } from './pages/flaky/index.ts';
import { Home } from './pages/home/index.ts';
import { NotFound } from './pages/not-found/index.ts';
import { Routes } from '../shared/index.ts';
import './styles.css';

/*
 * The app: the page each Route names, in the shell, in the Document. Its
 * one Worker ticks once the Runtime has started, which a page drawn by the
 * server shows only after it hydrates. Each page fades up into its slot,
 * and a page with no failed screen of its own shows the app's.
 */

const pages = Routes.outlet({ Home, Blog, Flaky, NotFound });

const AppActor = Actor.make('App', {
  props: Routes.props,
  model: Schema.Struct({ live: Schema.NullOr(Schema.Number) }),
  message: Schema.TaggedUnion({ Ticked: { now: Schema.Number } }),
}).build({
  init: () => ({ model: { live: null } }),
  children: pages.children,
  workers: {
    tick: {
      run: (self) =>
        Effect.forever(
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((now) => self.send({ _tag: 'Ticked', now })),
            Effect.andThen(Effect.sleep('1 second')),
          ),
        ),
    },
  },
  on: { Ticked: ({ now }) => ({ model: { live: now } }) },
});

const AppView = View.make(AppActor, (self) => (
  <div {...self.root}>
    <Layout live={self.model.live}>
      <pages.View of={self}>
        {(page) =>
          page && (
            <div key={page.key} className={enter}>
              {page.element}
            </div>
          )
        }
      </pages.View>
    </Layout>
  </div>
));

export default Start.app(
  Router.app(
    Routes,
    { actor: AppActor, view: AppView },
    {
      failed: ({ reason }) => (
        <Failed title="This page broke" reason={reason}>
          <p className="text-sm text-muted-foreground">
            Follow the link again to retry.
          </p>
        </Failed>
      ),
    },
  ),
  { document: Document },
);
