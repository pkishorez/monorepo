import { Layer, Schema } from 'effect';
import { Navigation, Page } from '@kestack/kabuki/routing';
import { router } from '../routes/index.ts';
import { Session } from './capabilities/index.ts';
import { Dashboard, DashboardLive } from './dashboard/index.ts';
import { Projects, ProjectsLive } from './projects/index.ts';
import { Settings, SettingsLive } from './settings/index.ts';
import { SignInLive } from './sign-in/index.ts';

/** The public page at /. The app draws it itself: it has nothing of its own. */
const Home = Page.define({ path: '/', metadata: { title: 'Acme' } });
const HomeLive = Page.build(Home);

/** The sign-in page. The form is the app's, there for as long as no one is signed in. */
const SignInPage = Page.define({
  path: '/sign-in',
  metadata: { title: 'Sign in · Acme' },
});
const SignInPageLive = Page.build(SignInPage);

/**
 * The app, its root page, and who the user is. Its pages are always there;
 * its View draws them only while SignedIn: that is the whole sign-in
 * guard, and the URL never changes for it. A signed-in user on a public
 * page is sent on to the dashboard, with the entry replaced, by a Worker
 * that runs for exactly as long as that is so.
 */
export const App = Page.define({
  pages: { Home, SignIn: SignInPage, Dashboard, Projects, Settings },
  state: Schema.TaggedUnion({
    SignedOut: {},
    SignedIn: { name: Schema.String },
  }),
  message: Schema.TaggedUnion({
    SignedIn: { name: Schema.String },
    SignOutClicked: {},
  }),
});

export const AppLive = Page.build(App, {
  pages: {
    Home: HomeLive,
    SignIn: SignInPageLive,
    Dashboard: DashboardLive,
    Projects: ProjectsLive,
    Settings: SettingsLive,
  },
  init: () => ({ state: { _tag: 'SignedOut' } }),
  provides: (self) =>
    Layer.succeed(Session, {
      signIn: (name) => self.send({ _tag: 'SignedIn', name }),
    }),
  state: {
    SignedOut: {
      children: { signIn: { actor: SignInLive } },
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
              navigation.replace(router.Dashboard()),
            ),
        },
      },
      on: { SignOutClicked: () => ({ state: { _tag: 'SignedOut' } }) },
    },
  },
});
