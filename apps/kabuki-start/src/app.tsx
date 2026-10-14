import { Clock, Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { About } from './pages/about/index.ts';
import { Account } from './pages/account/index.ts';
import { Blog } from './pages/blog/index.ts';
import { Dashboard } from './pages/dashboard/index.ts';
import { Docs } from './pages/docs/index.ts';
import { Home } from './pages/home/index.ts';
import { NotFound } from './pages/not-found/index.ts';
import { Shop } from './pages/shop/index.ts';
import { SignIn } from './pages/sign-in/index.ts';
import { Routes } from './routes.ts';
import { Shell } from './shell/index.ts';
import './styles.css';

/*
 * The app: the page each Route names, in the shell. Its one Worker ticks
 * once the Runtime has started, which a page drawn by the server shows only
 * after it hydrates.
 */

const pages = Routes.outlet({
  Home,
  About,
  Blog,
  Docs,
  SignIn,
  Account,
  Dashboard,
  Shop,
  NotFound,
});

const AppActor = Actor.make('App', {
  props: Routes.props,
  model: Schema.Struct({ live: Schema.NullOr(Schema.Number) }),
  message: Schema.TaggedUnion({ Ticked: { now: Schema.Number } }),
}).build({
  init: () => ({ model: { live: null } }),
  children: pages.children,
  invoke: pages.invoke,
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
    <Shell live={self.model.live}>
      <pages.View of={self} />
    </Shell>
  </div>
));

export default Router.app(Routes, { actor: AppActor, view: AppView });
