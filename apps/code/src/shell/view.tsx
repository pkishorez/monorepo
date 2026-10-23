import {
  useChild,
  useChildren,
  View,
  type ViewProps,
} from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { AccountSwitcherView } from '@kestack/web-platform/account-switcher';
import { AppShell, useAppShell } from '@kestack/web-platform/recipes/frame';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { keys } from '../keys.ts';
import * as places from '../places/index.ts';
import type { Place, Route } from '../places/index.ts';
import { ThemeToggle } from '../ui/theme/index.ts';
import { machineIdsOf, ShellLive } from './actor.ts';
import * as BackgroundJobs from './background-jobs/index.ts';
import { Connection } from './connection/index.ts';
import { DeviceState } from './device-state/index.ts';
import * as Dictation from './dictation/index.ts';
import { Model, Offline, Title } from './header/index.ts';
import * as Home from './home/index.ts';
import { Keyboard } from './keyboard.tsx';
import * as Machine from './machine/index.ts';
import * as MachineList from './machines/index.ts';
import * as MicrophonePicker from './microphone-picker/index.ts';
import * as ProjectPicker from './project-picker/index.ts';
import * as SessionActions from './session-actions/index.ts';
import * as SessionSwitcher from './session-switcher/index.ts';
import * as Settings from './settings/index.ts';
import {
  Account,
  AccountSlot,
  LocalSignInDialog,
  SignedOut,
} from './sign-in/index.ts';
import { Places, SettingsLink } from './sidebar/index.ts';

/*
 * The root page's View: the keyboard over everything, with the Bindings
 * from Device State, and the Account Switcher handed down to the header.
 * Nothing while Device State is read; signing in while nobody is; then
 * the app, on every Machine at once, in the Web Platform's App Shell: the
 * sidebar with every Machine's projects and their unsettled sessions,
 * Unseen ones bold, the Project Picker's plus, the Settled List, and
 * Settings at its foot; the header with where you are, Session Actions,
 * the Machine of the page while it is out of reach, the Account and the
 * theme, and the Project Picker and Session Switcher opened by keys, kept
 * there whatever the sidebar shows; the page the URL names; and over its
 * top right, every Machine's Background Jobs running, while any are; over
 * everything, in the bottom right corner, the Dictation's badge, and the
 * Dictation handed down to every Draft, with the Microphone Picker's
 * button for the Status Line. The sidebar and the page are
 * Surfaces of the root's keyboard. From anywhere, `n` starts a session in
 * the project open, `b` shows or hides the sidebar, Space and Ctrl+Space
 * start and stop a Dictation, `d` chooses its microphone, and Ctrl+, goes to Settings and, again or
 * by Escape, back.
 */

export const ShellView = View.make(
  ShellLive,
  ({ _tag, root, model, state, children, send }) => {
    // Nothing is drawn while Device State is read.
    if (_tag === 'Reading') return <div {...root} />;
    const { account } = model;
    return (
      <div {...root}>
        <Keyboard bindings={state.device.bindings}>
          <AccountSlot
            value={<AccountSwitcherView instance={children.account} />}
          >
            {account._tag !== 'SignedIn' ? (
              <SignedOut
                checking={account._tag === 'Checking'}
                problem={model.signInProblem}
                onSignIn={() => send({ _tag: 'SignIn' })}
              />
            ) : (
              <Signed
                model={model}
                unseen={state.device.unseen}
                actors={children}
                send={send}
              />
            )}
          </AccountSlot>
          <LocalSignInDialog />
        </Keyboard>
      </div>
    );
  },
);

type Self = Extract<ViewProps<typeof ShellLive>, { readonly _tag: 'Ready' }>;

interface Signed {
  readonly model: Self['model'];
  /** This device's Unseen marks, by Machine id and then Session id. */
  readonly unseen: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly actors: Self['children'];
  readonly send: Self['send'];
}

/** The app, signed in: every Machine's, inside the connections' provider. */
function Signed(self: Signed) {
  const { model, actors: children } = self;
  const status = useChild(children.connections, ({ model }) => model.status);
  const listed = new Set(machineIdsOf(model));
  const machines =
    model.known.machines?.filter(({ id }) => listed.has(id)) ?? null;
  return (
    <Connection value={{ machines, status: status ?? {} }}>
      <Shell {...self} />
    </Connection>
  );
}

function Shell({ model, unseen, actors: children, send }: Signed) {
  const route = places.placeOf(useRouter<Route>().route);
  const { enter } = keys.useKeyboard();
  const inSettings = route._tag === 'Settings';
  const settings = () =>
    send(
      inSettings
        ? { _tag: 'Settings', from: null, back: true }
        : {
            _tag: 'Settings',
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
        _tag: 'OpenProject',
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
      ask: (ask: typeof Dictation.Ask.Type) => send({ _tag: 'Dictate', ask }),
      microphones: (
        <MicrophonePicker.Button instance={children.microphonePicker} />
      ),
      shown: drafts.shown,
    }),
    [children.dictation, children.microphonePicker, send, drafts.shown],
  );
  Dictation.useDictationKeys(dictating.ask);
  const [projects] = useChildren(children.projects, ({ model }) => model);
  const [found] = useChildren(children.sessions, ({ model }) => model);
  const running = useChild(
    children.backgroundJobs,
    ({ model }) => model.sessions,
  );
  const sessions = (found?.rows ?? []).map(({ row }) => row);
  const projectRows = (projects?.rows ?? []).map(({ row }) => row);
  const sessionId =
    route._tag === 'Project' ? route.page?.sessionId : undefined;
  // Never listed on this device yet: the sidebar is a skeleton meanwhile.
  const neverListed =
    model.known.machines === null && model.known.problem === null;
  return (
    <Dictation.Dictating value={dictating}>
      <Screen
        route={route}
        sidebar={
          <Places
            route={route}
            projects={{
              rows: projectRows,
              loading: neverListed || (projects?.neverSynced.length ?? 0) > 0,
            }}
            sessions={sessions}
            jobs={BackgroundJobs.bySession(running ?? [])}
            isUnseen={(each) =>
              DeviceState.isUnseen(
                unseen[each.machineId] ?? {},
                each.id,
                each.endedAt,
              )
            }
            unsettling={model.unsettling}
            projectPicker={
              <ProjectPicker.Button instance={children.projectPicker} />
            }
            onOpenSession={(machineId, projectId, sessionId) =>
              send({ _tag: 'OpenSession', machineId, projectId, sessionId })
            }
            onUnsettle={(machineId, sessionId) =>
              send({ _tag: 'Unsettle', machineId, sessionId })
            }
          />
        }
        header={{
          title: (
            <Title
              route={route}
              projects={projectRows}
              sessions={sessions}
              neverSynced={[
                ...(projects?.neverSynced ?? []),
                ...(found?.neverSynced ?? []),
              ]}
            />
          ),
          actions: (
            <>
              <Model
                session={sessions.find(
                  (each) =>
                    route._tag === 'Project' &&
                    each.machineId === route.machineId &&
                    each.id === sessionId,
                )}
              />
              <SessionActions.View instance={children.sessionActions} />
              <SessionSwitcher.View instance={children.sessionSwitcher} />
              <ProjectPicker.View instance={children.projectPicker} />
              <MicrophonePicker.View instance={children.microphonePicker} />
              {route._tag === 'Project' && (
                <Offline machineId={route.machineId} />
              )}
              <ThemeToggle />
              <Account />
            </>
          ),
        }}
      >
        <BackgroundJobs.Known value={{ projects: projectRows, sessions }}>
          <BackgroundJobs.Bubble instance={children.backgroundJobs} />
        </BackgroundJobs.Known>
        <ProjectPicker.Notice instance={children.projectPicker} />
        {children.Home ? (
          <>
            {children.machines && (
              <MachineList.View instance={children.machines} />
            )}
            <Home.View instance={children.Home} />
          </>
        ) : children.Machine ? (
          <Machine.View instance={children.Machine} />
        ) : children.Settings ? (
          <Settings.View instance={children.Settings} />
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
        <Dictation.Badge instance={children.dictation} />
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
                <SettingsLink route={route} />
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
