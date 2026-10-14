import { Layer, Schema } from 'effect';
import { Navigation, Route } from '@kestack/kabuki/routing';
import { Routes } from '../routes/index.ts';
import { Session } from './capabilities/index.ts';
import { Dashboard } from './dashboard/index.ts';
import { Projects } from './projects/index.ts';
import { Settings } from './settings/index.ts';
import { SignIn } from './sign-in/index.ts';

/** The public page at /. The app draws it itself: it has nothing of its own. */
const Home = Route.page({ path: '/', metadata: { title: 'Acme' } }).build({});

/** The sign-in page. The form is the app's, there for as long as no one is signed in. */
const SignInPage = Route.page({
  path: '/sign-in',
  metadata: { title: 'Sign in · Acme' },
}).build({});

/**
 * The app, its root page, and who the user is. Its pages are always there;
 * its View draws them only while SignedIn: that is the whole sign-in
 * guard, and the URL never changes for it. A signed-in user on a public
 * page is sent on to the dashboard, with the entry replaced, by a Worker
 * that runs for exactly as long as that is so.
 */
export const App = Route.page({
  pages: { Home, SignIn: SignInPage, Dashboard, Projects, Settings },
  requires: [Navigation],
  state: Schema.TaggedUnion({
    SignedOut: {},
    SignedIn: { name: Schema.String },
  }),
  message: Schema.TaggedUnion({
    SignedIn: { name: Schema.String },
    SignOutClicked: {},
  }),
}).build({
  init: () => ({ state: { _tag: 'SignedOut' } }),
  provides: (self) =>
    Layer.succeed(Session, {
      signIn: (name) => self.send({ _tag: 'SignedIn', name }),
    }),
  state: {
    SignedOut: {
      children: { signIn: { actor: SignIn.actor } },
      on: { SignedIn: ({ name }) => ({ state: { _tag: 'SignedIn', name } }) },
    },
    SignedIn: {
      workers: {
        onward: {
          while: ({ props }) =>
            props.route.page?._tag === 'Home' ||
            props.route.page?._tag === 'SignIn',
          run: () =>
            Navigation.use((navigation) =>
              navigation.replace(() => Routes.Dashboard()),
            ),
        },
      },
      on: { SignOutClicked: () => ({ state: { _tag: 'SignedOut' } }) },
    },
  },
});
