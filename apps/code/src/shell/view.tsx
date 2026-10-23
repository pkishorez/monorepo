import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { AccountSwitcherView } from '@kestack/web-platform/account-switcher';
import { AppShell, useAppShell } from '@kestack/web-platform/recipes/frame';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import type { Ask } from '../layer/capabilities/index.ts';
import { keys } from '../keys.ts';
import * as places from './places/index.ts';
import type { Place, Route } from './places/index.ts';
import {
  Account,
  AccountSlot,
  LocalSignInDialog,
  SignedOut,
} from '../sign-in/index.ts';
import { ThemeToggle } from '../ui/theme/index.ts';
import { Dictation } from './actors/dictation/index.ts';
import { Header } from './actors/header/index.ts';
import { MachineList } from './actors/machine-list/index.ts';
import { MicrophonePicker } from './actors/microphone-picker/index.ts';
import { ProjectPicker } from './actors/project-picker/index.ts';
import { SessionActions } from './actors/session-actions/index.ts';
import { SessionSwitcher } from './actors/session-switcher/index.ts';
import { Sidebar } from './actors/sidebar/index.ts';
import { ShellLive } from './actor.ts';
import { Connection } from './connection/index.ts';
import { Keyboard } from './keyboard.tsx';
import { Home } from './pages/home/index.ts';
import { Project } from './pages/project/index.ts';
import { Settings } from './pages/settings/index.ts';

/*
 * The root page's View: the keyboard over everything, with the Bindings
 * from Device State, and the Account Switcher handed down to the header.
 * Nothing while the Bindings are read; signing in while nobody is; then
 * the app, on every Machine at once, in the Web Platform's App Shell: the
 * sidebar (`actors/sidebar/`), the header with where you are
 * (`actors/header/`), Session Actions, the Machine of the page while it is
 * out of reach, the Account and the theme, and the Project Picker and
 * Session Switcher opened by keys; the page the URL names; over
 * everything, in the bottom right corner, the Dictation's badge, and the
 * Dictation handed down to every Draft, with the Microphone Picker's
 * button for the Status Line. Each part is handed its own Instance, never
 * its data, so a change to one draws only it. The sidebar and the page
 * are Surfaces of the root's keyboard. From anywhere, `n` starts a session
 * in the project open, `b` shows or hides the sidebar, Space and
 * Ctrl+Space start and stop a Dictation, `d` chooses its microphone, and
 * Ctrl+, goes to Settings and, again or by Escape, back.
 */

export const ShellView = View.make(
  ShellLive,
  ({ _tag, root, model, state, children, send }) => {
    // Nothing is drawn while the Bindings are read.
    if (_tag === 'Reading') return <div {...root} />;
    const { account } = model;
    return (
      <div {...root}>
        <Keyboard bindings={state.bindings}>
          <AccountSlot
            value={<AccountSwitcherView instance={children.account} />}
          >
            {account._tag !== 'SignedIn' ? (
              <SignedOut
                checking={account._tag === 'Checking'}
                problem={model.signInProblem}
                onSignIn={() => send({ _tag: 'SignInAsked' })}
              />
            ) : (
              <Machines machines={children.machines}>
                <Signed actors={children} send={send} />
              </Machines>
            )}
          </AccountSlot>
          <LocalSignInDialog />
        </Keyboard>
      </div>
    );
  },
);

type Self = Extract<ViewProps<typeof ShellLive>, { readonly _tag: 'Ready' }>;

/**
 * Every Machine as the Views see it, as listed and with its line now. Only
 * this provider draws again as they change, and what reads them.
 */
function Machines({
  machines,
  children,
}: {
  readonly machines: Self['children']['machines'];
  readonly children: ReactNode;
}) {
  if (machines === undefined)
    return (
      <Connection value={{ machines: null, status: {} }}>{children}</Connection>
    );
  return <Listed machines={machines}>{children}</Listed>;
}

function Listed({
  machines,
  children,
}: {
  readonly machines: NonNullable<Self['children']['machines']>;
  readonly children: ReactNode;
}) {
  const known = useChild(machines, ({ model }) => model);
  const value = useMemo(
    () => ({ machines: known?.machines ?? null, status: known?.lines ?? {} }),
    [known?.machines, known?.lines],
  );
  return <Connection value={value}>{children}</Connection>;
}

/** The app, signed in. */
function Signed({
  actors: children,
  send,
}: {
  readonly actors: Self['children'];
  readonly send: Self['send'];
}) {
  const route = places.placeOf(useRouter<Route>().route);
  const { enter } = keys.useKeyboard();
  const inSettings = route._tag === 'Settings';
  const settings = () =>
    send(
      inSettings
        ? { _tag: 'SettingsToggled', from: null, back: true }
        : {
            _tag: 'SettingsToggled',
            back: false,
            from:
              route._tag === 'Project'
                ? {
                    machineId: route.machineId,
                    projectId: route.projectId,
                    sessionId: route.page?.sessionId ?? null,
                  }
                : null,
          },
    );
  keys.useAction('app.settings', settings);
  keys.useAction('content.close', settings, { enabled: inSettings });
  keys.useAction(
    'app.newSession',
    () => {
      if (route._tag !== 'Project') return;
      send({
        _tag: 'NewSessionAsked',
        machineId: route.machineId,
        projectId: route.projectId,
      });
      enter('content');
    },
    { enabled: route._tag === 'Project' },
  );
  const drafts = Dictation.useDraftsShown();
  // The Dictation itself is handed down, never its State, which moves
  // with every level heard: what reads it draws again, nothing else.
  const dictating = useMemo(
    () => ({
      dictation: children.dictation,
      ask: (ask: typeof Ask.Type) => send({ _tag: 'DictationAsked', ask }),
      microphones: (
        <MicrophonePicker.button instance={children.microphonePicker} />
      ),
      shown: drafts.shown,
    }),
    [children.dictation, children.microphonePicker, send, drafts.shown],
  );
  Dictation.useDictationKeys(dictating.ask);
  const slots = useMemo(
    () => ({
      projectPicker: <ProjectPicker.button instance={children.projectPicker} />,
    }),
    [children.projectPicker],
  );
  return (
    <Dictation.Dictating value={dictating}>
      <Screen
        route={route}
        sidebar={
          <Sidebar.Slots value={slots}>
            <Sidebar.view instance={children.sidebar} />
          </Sidebar.Slots>
        }
        header={{
          title: <Header.view instance={children.header} />,
          actions: (
            <>
              <Header.model instance={children.header} />
              <SessionActions.view instance={children.sessionActions} />
              <SessionSwitcher.view instance={children.sessionSwitcher} />
              <ProjectPicker.view instance={children.projectPicker} />
              <MicrophonePicker.view instance={children.microphonePicker} />
              {route._tag === 'Project' && (
                <Header.Offline machineId={route.machineId} />
              )}
              <ThemeToggle />
              <Account />
            </>
          ),
        }}
      >
        <ProjectPicker.notice instance={children.projectPicker} />
        {children.Home ? (
          <>
            {children.machines && (
              <MachineList.view instance={children.machines} />
            )}
            <Home.view instance={children.Home} />
          </>
        ) : children.Project ? (
          <Project.view instance={children.Project} />
        ) : children.Settings ? (
          <Settings.view instance={children.Settings} />
        ) : (
          <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
            Nothing lives at this address.{' '}
            <Router.Link
              to={places.home()}
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Go to your projects
            </Router.Link>
          </p>
        )}
      </Screen>
      <Dictation.DraftsShown value={drafts.count}>
        <Dictation.view instance={children.dictation} />
      </Dictation.DraftsShown>
    </Dictation.Dictating>
  );
}

/**
 * The App Shell inside the keyboard: the whole sidebar is the `sidebar`
 * Surface and the whole page, its header too, the `content` one, and the
 * shell floats as a window. The page draws its own Status Line.
 */
function Screen({
  route,
  sidebar,
  header,
  children,
}: {
  readonly route: Place;
  readonly sidebar: ReactNode;
  readonly header: ComponentProps<typeof AppShell>['header'];
  readonly children: ReactNode;
}) {
  return (
    <AppShell
      // Given, so the shell floats as a window; with no status line of
      // the keys' own, since the page draws the Status Line.
      vim={{ on: false }}
      sidebar={{
        width: 260,
        content: (
          <keys.Surface id="sidebar" asChild>
            <div className="flex min-h-0 flex-1 flex-col rounded-xl pt-2 md:mx-2">
              <SidebarSwitch />
              <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                {sidebar}
              </div>
              <div className="flex flex-col gap-2 p-2">
                <Sidebar.SettingsLink route={route} />
              </div>
            </div>
          </keys.Surface>
        ),
      }}
      header={header}
      column={(column) => (
        <keys.Surface id="content" asChild>
          {column}
        </keys.Surface>
      )}
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-y-auto">
        {children}
      </div>
    </AppShell>
  );
}

/**
 * `b` shows or hides the sidebar. Hiding it while
 * the keyboard is in it goes to the page, so focus is never left in what
 * is hidden. Not kept: the App Shell holds whether it is open, shut at
 * first on a phone and open on a wide screen.
 */
function SidebarSwitch() {
  const shell = useAppShell();
  const { active, enter } = keys.useKeyboard();
  keys.useAction('app.sidebar', () => {
    if (shell.open && active === 'sidebar') enter('content');
    shell.toggle();
  });
  return null;
}
