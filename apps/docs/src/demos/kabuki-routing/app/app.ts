import { Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { Routes } from '../routes/index.ts';
import { Session } from './capabilities/index.ts';
import { Dashboard } from './dashboard/index.ts';
import { Projects } from './projects/index.ts';
import { Settings } from './settings/index.ts';
import { SignIn } from './sign-in/index.ts';
import { NotFound, Redirecting } from './screens.tsx';

/** The top-level pages a signed-in user can be on. The public ones are passed through. */
export const pages = Routes.outlet({
  Home: Redirecting,
  SignIn: Redirecting,
  Dashboard,
  Projects,
  Settings,
  NotFound,
});

/**
 * Who the user is. The pages exist only while SignedIn: that is the whole
 * sign-in guard, and the URL never changes for it. A signed-in user on a
 * public page is sent on to the dashboard, with the entry replaced, by a
 * Worker that runs for exactly as long as that is so.
 */
export const AppActor = Actor.make('App', {
  requires: [Navigation],
  props: Routes.props,
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
      children: pages.children,
      workers: {
        onward: {
          while: ({ props }) =>
            props.page._tag === 'Home' || props.page._tag === 'SignIn',
          run: () =>
            Navigation.use((navigation) =>
              navigation.replace(Routes.Dashboard()),
            ),
        },
      },
      on: { SignOutClicked: () => ({ state: { _tag: 'SignedOut' } }) },
    },
  },
});
