import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Card, CardContent } from '@kestack/web-platform/components/card';
import { Separator } from '@kestack/web-platform/components/separator';
import { Page, Provenance } from '../../parts/index.ts';
import { Routes } from '../../routes.ts';
import { Session } from '../../session/index.ts';

/*
 * The account: dynamic, drawn for each request from the session cookie. Its
 * Loader Redirects to sign-in when there is none, on the server and after a
 * click alike. Settings load with it, at once; activity is the browser's.
 */

const sections = Routes.Account.outlet({
  Overview: () => (
    <Page
      place="Account.Overview"
      title="Overview"
      intro="A place with no Input under a dynamic one: drawn for this request, from the account's Input alone."
    />
  ),
  Settings: (_props, prefs) => (
    <Page place="Account.Settings" loadedAt={prefs.loadedAt} title="Settings">
      <Card className="max-w-md">
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{prefs.email}</dd>
            <dt className="text-muted-foreground">Newsletter</dt>
            <dd>{prefs.newsletter ? 'Yes' : 'No'}</dd>
            <dt className="text-muted-foreground">Language</dt>
            <dd>{prefs.language}</dd>
          </dl>
        </CardContent>
      </Card>
    </Page>
  ),
  Activity: (_props, activity) => (
    <Page
      place="Account.Activity"
      loadedAt={activity.loadedAt}
      title="Activity"
      intro="A client place under a dynamic one: the server drew the account around it, and the browser loaded this."
    >
      <Card className="max-w-md">
        <CardContent>
          <ol className="divide-y divide-border">
            {activity.events.map((event) => (
              <li
                key={event.what}
                className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
              >
                <span>{event.what}</span>
                <span className="text-sm text-muted-foreground">
                  {event.ago}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </Page>
  ),
});

/** Clears the session cookie in the browser, then goes home. */
const signOut = Command.make('sign out', {
  args: Schema.Struct({}),
  run: () =>
    Effect.sync(Session.signOut).pipe(
      Effect.andThen(
        Navigation.use((navigation) => navigation.replace(Routes.SignIn())),
      ),
    ),
});

const AccountActor = Actor.make('Account', {
  requires: [Navigation],
  input: Routes.Account.input,
  props: Routes.Account.props,
  model: Routes.Account.input,
  message: Schema.TaggedUnion({ SignOutClicked: {} }),
}).build({
  init: (viewer) => ({ model: viewer }),
  children: sections.children,
  invoke: sections.invoke,
  on: { SignOutClicked: () => ({ command: signOut({}) }) },
});

const TABS = [
  { to: Routes.Account.Overview(), page: 'Overview', label: 'Overview' },
  { to: Routes.Account.Settings(), page: 'Settings', label: 'Settings' },
  { to: Routes.Account.Activity(), page: 'Activity', label: 'Activity' },
] as const;

const AccountView = View.make(AccountActor, (self) => {
  const at = self.props.page._tag;
  return (
    <div {...self.root} className="grid gap-10 md:grid-cols-[15rem_1fr]">
      <aside className="space-y-4">
        <Card size="sm">
          <CardContent className="gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-medium"
              >
                {self.model.name.slice(0, 1).toUpperCase()}
              </span>
              <p className="min-w-0 text-sm leading-snug">
                <span className="block text-muted-foreground">
                  Signed in as
                </span>{' '}
                <strong data-testid="viewer">{self.model.name}</strong>
              </p>
            </div>
            <Separator />
            <ul className="-mx-1 space-y-0.5">
              {TABS.map(({ to, page, label }) => (
                <li key={label}>
                  <Router.Link
                    to={to}
                    aria-current={page === at ? 'page' : undefined}
                    className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                  >
                    {label}
                  </Router.Link>
                </li>
              ))}
            </ul>
            <Separator />
            <Button
              variant="outline"
              size="sm"
              onClick={() => self.send({ _tag: 'SignOutClicked' })}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
        <Provenance place="Account" loadedAt={self.model.loadedAt} />
      </aside>
      <sections.View of={self} />
    </div>
  );
});

export const Account = { actor: AccountActor, view: AccountView };
