import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import type { ComponentProps, ReactNode } from 'react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { AppShell, useAppShell } from '@kestack/web-platform/recipes/frame';
import { KeysStatusBar } from '@kestack/web-platform/recipes/keyboard';
import * as places from '../places/index.ts';
import type { Place } from '../places/index.ts';
import { keys } from '../keys.ts';
import { ThemeToggle } from '../ui/theme/index.ts';
import { ShellLive } from './actor.ts';
import * as BackgroundJobs from './background-jobs/index.ts';
import { Connection } from './connection/index.ts';
import { DeviceState } from './device-state/index.ts';
import { Brand, Model, Offline, Title } from './header/index.ts';
import * as Home from './home/index.ts';
import { Keyboard } from './keyboard.tsx';
import * as ProjectPage from './project/index.ts';
import * as ProjectPicker from './project-picker/index.ts';
import * as SessionActions from './session-actions/index.ts';
import * as SessionSwitcher from './session-switcher/index.ts';
import * as Settings from './settings/index.ts';
import { Places, SettingsLink } from './sidebar/index.ts';

/*
 * The root page's View, in the Web Platform's App Shell: the sidebar with
 * every project and its unsettled sessions, Unseen ones bold, the Project
 * Picker's plus, the Settled List, and Settings at its foot; the header with where you are, Session
 * Actions, the connection while it is down, and the theme, and the
 * Project Picker and Session Switcher opened by keys, kept there whatever
 * the sidebar shows; the page the
 * URL names; and over its top right, the Background Jobs running, while
 * any are. Over it all, the keyboard: the sidebar and the page are
 * Surfaces, and in Vim Mode a status bar runs along the bottom. From
 * anywhere, Ctrl+N starts a session in the project open, Ctrl+B shows or
 * hides the sidebar, and Ctrl+, goes to Settings and, again or by Escape,
 * back. Nothing is drawn while Device State is read.
 */

export const ShellView = View.make(
  ShellLive,
  ({ _tag, root, model, state, children, send }) => {
    // Nothing is drawn while Device State is read.
    if (_tag === 'Reading') return <div {...root} />;
    return (
      <Connection value={model.connection}>
        <div {...root}>
          <Keyboard
            vim={state.device.vim}
            bindings={state.device.bindings}
            onVimChange={(on) => send({ _tag: 'SetVim', on })}
          >
            <Shell
              actors={children}
              unseen={state.device.unseen}
              unsettling={model.unsettling}
              onUnsettle={(sessionId) => send({ _tag: 'Unsettle', sessionId })}
              onOpenSession={(projectId, sessionId) =>
                send({ _tag: 'OpenSession', projectId, sessionId })
              }
              onOpenProject={(projectId) =>
                send({ _tag: 'OpenProject', projectId })
              }
              onSettings={(from) => send({ _tag: 'Settings', from })}
            />
          </Keyboard>
        </div>
      </Connection>
    );
  },
);

/** Inside the connection's provider, which the header reads, and the keyboard. */
function Shell({
  actors: children,
  unseen,
  unsettling,
  onUnsettle,
  onOpenSession,
  onOpenProject,
  onSettings,
}: {
  readonly actors: Extract<
    ViewProps<typeof ShellLive>,
    { readonly _tag: 'Ready' }
  >['children'];
  /** This device's Unseen marks, by Session id. */
  readonly unseen: Readonly<Record<string, number>>;
  readonly unsettling: ComponentProps<typeof Places>['unsettling'];
  readonly onUnsettle: (sessionId: string) => void;
  readonly onOpenSession: (projectId: string, sessionId: string) => void;
  readonly onOpenProject: (projectId: string) => void;
  /** To Settings from where the app is, or, with null, back. */
  readonly onSettings: (
    from: {
      readonly projectId: string | null;
      readonly sessionId: string | null;
    } | null,
  ) => void;
}) {
  const { route } = useRouter<Place>();
  const { enter } = keys.useKeyboard();
  const inSettings = route._tag === 'Settings';
  const settings = () =>
    onSettings(
      inSettings
        ? null
        : route._tag === 'Project'
          ? {
              projectId: route.projectId,
              sessionId: route.page?.sessionId ?? null,
            }
          : { projectId: null, sessionId: null },
    );
  keys.useAction('app.settings', settings);
  keys.useAction('content.close', settings, { enabled: inSettings });
  keys.useAction(
    'app.newSession',
    () => {
      if (route._tag !== 'Project') return;
      onOpenProject(route.projectId);
      enter('content');
    },
    { enabled: route._tag === 'Project' },
  );
  const projects = useChild(children.projects, ({ model }) => model);
  const found = useChild(children.sessions, ({ model }) => model);
  const running = useChild(
    children.backgroundJobs,
    ({ model }) => model.sessions,
  );
  const sessions = (found?.rows ?? []).map(({ row }) => row);
  const projectRows = (projects?.rows ?? []).map(({ row }) => row);
  const sessionId =
    route._tag === 'Project' ? route.page?.sessionId : undefined;
  return (
    <Screen
      route={route}
      sidebar={
        <Places
          route={route}
          projects={{
            rows: projectRows,
            caughtUp: projects?.caughtUp === true,
          }}
          sessions={sessions}
          jobs={BackgroundJobs.bySession(running ?? [])}
          isUnseen={(each) =>
            DeviceState.isUnseen(unseen, each.id, each.endedAt)
          }
          unsettling={unsettling}
          projectPicker={
            <ProjectPicker.Button instance={children.projectPicker} />
          }
          onOpenSession={onOpenSession}
          onUnsettle={onUnsettle}
        />
      }
      header={{
        title: (
          <Title
            route={route}
            projects={projectRows}
            sessions={sessions}
            caughtUp={{
              projects: projects?.caughtUp === true,
              sessions: found?.caughtUp === true,
            }}
          />
        ),
        actions: (
          <>
            <Model session={sessions.find(({ id }) => id === sessionId)} />
            <SessionActions.View instance={children.sessionActions} />
            <SessionSwitcher.View instance={children.sessionSwitcher} />
            <ProjectPicker.View instance={children.projectPicker} />
            <Offline />
            <ThemeToggle />
          </>
        ),
      }}
    >
      <BackgroundJobs.Known value={{ projects: projectRows, sessions }}>
        <BackgroundJobs.Bubble instance={children.backgroundJobs} />
      </BackgroundJobs.Known>
      <ProjectPicker.Notice instance={children.projectPicker} />
      {children.Home ? (
        <Home.View instance={children.Home} />
      ) : children.Project ? (
        <ProjectPage.View instance={children.Project} />
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
  );
}

/**
 * The App Shell inside the keyboard: the whole sidebar is the `sidebar`
 * Surface and the whole page, its header too, the `content` one, and in Vim Mode the shell
 * is a window with the status line at its foot.
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
  const { vim, enter } = keys.useKeyboard();
  return (
    <AppShell
      vim={{
        on: vim.on,
        statusLine: <KeysStatusBar keys={keys} onHelp={() => enter('help')} />,
      }}
      sidebar={{
        width: 260,
        content: (
          <keys.Surface id="sidebar" asChild>
            <div className="flex min-h-0 flex-1 flex-col rounded-xl md:mx-2">
              <div className="flex flex-col gap-2 p-2">
                <Brand />
                <SidebarSwitch />
              </div>
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
 * Ctrl+B shows or hides the sidebar, even while typing. Hiding it while
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
