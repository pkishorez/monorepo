import { Route } from '@kestack/kabuki/routing';
import { Routes } from '../routes/index.ts';
import { DashboardView } from './dashboard/index.ts';
import { ProjectsView } from './projects/index.ts';
import { SettingsView } from './settings/index.ts';
import { SignIn } from './sign-in/index.ts';
import { App } from './app.ts';
import {
  Landing,
  NotFound,
  Redirecting,
  Shell,
  SignInCard,
  Toolbar,
} from './screens.tsx';

/**
 * The app under its address bar: the public page, sign-in where a page needs
 * a user, or the signed-in app around the page its Route names.
 */
export const AppView = Route.view(App, (self) => {
  const { page, notFound } = self.props.route;
  const pages = self.children;
  return (
    <div {...self.root} className="flex h-full flex-col">
      <Toolbar />
      {self._tag === 'SignedIn' ? (
        <Shell
          route={page}
          name={self.state.name}
          onSignOut={() => self.send({ _tag: 'SignOutClicked' })}
        >
          {(page?._tag === 'Home' || page?._tag === 'SignIn') && (
            <Redirecting />
          )}
          {pages.Dashboard && <DashboardView instance={pages.Dashboard} />}
          {pages.Projects && <ProjectsView instance={pages.Projects} />}
          {pages.Settings && <SettingsView instance={pages.Settings} />}
          {notFound !== null && <NotFound path={notFound} />}
        </Shell>
      ) : page?._tag === 'Home' ? (
        <Landing />
      ) : notFound !== null ? (
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          <NotFound path={notFound} />
        </div>
      ) : (
        <SignInCard
          wanted={page && page._tag !== 'SignIn' ? Routes.path(page) : null}
        >
          <SignIn.view instance={self.children.signIn} />
        </SignInCard>
      )}
    </div>
  );
});
