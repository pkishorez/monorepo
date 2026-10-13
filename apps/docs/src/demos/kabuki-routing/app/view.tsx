import { View } from '@kestack/kabuki/react';
import { Routes } from '../routes/index.ts';
import type { Route } from '../routes/index.ts';
import { SignIn } from './sign-in/index.ts';
import { AppActor, pages } from './app.ts';
import { Landing, NotFound, Shell, SignInCard, Toolbar } from './screens.tsx';

const PUBLIC: ReadonlyArray<Route['_tag']> = ['Home', 'SignIn', 'NotFound'];

/**
 * The app under its address bar: the public page, sign-in where a page needs
 * a user, or the signed-in app around the page its Route names.
 */
export const AppView = View.make(AppActor, (self) => {
  const route = self.props.page as Route;
  return (
    <div {...self.root} className="flex h-full flex-col">
      <Toolbar />
      {self._tag === 'SignedIn' ? (
        <Shell
          route={route}
          name={self.state.name}
          onSignOut={() => self.send({ _tag: 'SignOutClicked' })}
        >
          <pages.View of={self} />
        </Shell>
      ) : route._tag === 'Home' ? (
        <Landing />
      ) : route._tag === 'NotFound' ? (
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          <NotFound path={route.path} />
        </div>
      ) : (
        <SignInCard
          wanted={PUBLIC.includes(route._tag) ? null : Routes.path(route)}
        >
          <SignIn.view instance={self.children.signIn} />
        </SignInCard>
      )}
    </div>
  );
});
