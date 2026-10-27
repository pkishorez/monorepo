import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import {
  AccountSwitcherList,
  AccountSwitcherView,
} from '@kestack/web-platform/recipes/account-switcher';
import { AppShell, useAppShell } from '@kestack/web-platform/recipes/frame';
import { Button } from '@kestack/web-platform/ui/components/button';
import { SettingsIcon } from '@kestack/web-platform/ui/components/lucide';
import { useDevice } from '@kestack/web-platform/ui/input';
import { KeysStatusBar } from '@kestack/web-platform/recipes/keyboard';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import type { Ask } from '../layer/capabilities/index.ts';
import { keys } from '../keys.ts';
import * as routes from './routes/index.ts';
import type { Route } from './routes/index.ts';
import { Account, AccountSlot, SignedOut } from './sign-in.tsx';
import { Theme, ThemeToggle } from '../ui/theme/index.ts';
import { Toasts } from '../ui/toast/index.ts';
import { Dictation } from './actors/dictation/index.ts';
import { Header } from './actors/header/index.ts';
import { MachineList, Connection } from './machines/index.ts';
import { KeysPicker } from './actors/pickers/keys-picker/index.ts';
import { MicrophonePicker } from './actors/pickers/microphone-picker/index.ts';
import { ProjectPicker } from './actors/pickers/project-picker/index.ts';
import { SessionActions } from './actors/pickers/session-actions/index.ts';
import { SessionSwitcher } from './actors/pickers/session-switcher/index.ts';
import { Sidebar } from './actors/sidebar/index.ts';
import { ShellLive } from './actor.ts';
import { Keyboard } from './keyboard.tsx';
import { Home } from './pages/home/index.ts';
import { Kabuki } from './pages/kabuki/index.ts';
import { Project } from './pages/project/index.ts';
import { Settings } from './pages/settings/index.ts';

/*
 * The root page's View: the keyboard over everything, with the Bindings
 * from Device State, and the Account Switcher handed down to the header.
 * Nothing while the Bindings are read; signing in while nobody is; then
 * the app, on every Machine at once, in the Web Platform's App Shell: the
 * sidebar (`actors/sidebar/`), the header with where you are
 * (`actors/header/`), Session Actions, the Machine of the page while it is
 * out of reach, the Account and the theme, and the Project Picker, the
 * Session Switcher and the Keys Picker opened by keys; the page the URL names; over
 * everything, in the bottom right corner, the Dictation's badge, and the
 * Dictation handed down to every Draft, with the Microphone Picker's
 * button for the Status Line. Each part is handed its own Instance, never
 * its data, so a change to one draws only it. The sidebar and the page
 * are Surfaces of the root's keyboard. From anywhere, `n` starts a session
 * in the project open, `b` shows or hides the sidebar, Space and
 * Ctrl+Space start and stop a Dictation, `d` chooses its microphone,
 * Ctrl+, goes to Settings and, again or by Escape, back, and Ctrl+O and
 * Ctrl+I go Back and Forward, and in Vim Mode `t` switches the theme.
 */

export const ShellView = View.make(
  ShellLive,
  ({ _tag, root, model, state, children, send }) => {
    // A prototype: the app's Actor tree, open to anyone, signed in or not.
    if (children.Kabuki)
      return (
        <div {...root}>
          <Kabuki.view instance={children.Kabuki} />
        </div>
      );
    // Nothing is drawn while the keyboard is read.
    if (_tag === 'Reading') return <div {...root} />;
    const { account } = model;
    return (
      <div {...root}>
        <TextSize size={state.keyboard.textSize} />
        <Keyboard
          vim={state.keyboard.vim}
          bindings={state.keyboard.bindings}
          onVimChange={(on) => send({ _tag: 'VimChanged', on })}
        >
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
                <Signed
                  actors={children}
                  email={account.email}
                  floating={state.keyboard.floating}
                  sidebarWidth={state.keyboard.sidebarWidth}
                  send={send}
                />
              </Machines>
            )}
          </AccountSlot>
        </Keyboard>
      </div>
    );
  },
);

/** Marks `<html>` with the text size chosen, which the styles size by. */
function TextSize({ size }: { readonly size: string }) {
  useEffect(() => {
    document.documentElement.dataset.textSize = size;
  }, [size]);
  return null;
}

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
    () => ({
      machines: known?.list.value ?? null,
      status: known?.lines ?? {},
    }),
    [known?.list.value, known?.lines],
  );
  return <Connection value={value}>{children}</Connection>;
}

/** The app, signed in. */
function Signed({
  actors: children,
  email,
  floating,
  sidebarWidth,
  send,
}: {
  readonly actors: Self['children'];
  /** Who is signed in. */
  readonly email: string;
  /** Whether the app floats as a window on a wide screen. */
  readonly floating: boolean;
  /** The sidebar's width on a wide screen, as kept. */
  readonly sidebarWidth: number;
  readonly send: Self['send'];
}) {
  const route = useRouter<Route>().route;
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
  keys.useAction('app.theme', Theme.useTheme().toggleTheme);
  keys.useAction('app.back', () => send({ _tag: 'BackAsked' }));
  keys.useAction('app.forward', () => send({ _tag: 'ForwardAsked' }));
  keys.useAction('content.close', settings, { enabled: inSettings });
  const newSession = () => {
    if (route._tag !== 'Project') return;
    send({
      _tag: 'NewSessionAsked',
      machineId: route.machineId,
      projectId: route.projectId,
    });
    enter('content');
  };
  keys.useAction('app.newSession', newSession, {
    enabled: route._tag === 'Project',
  });
  keys.useAction('app.newSessionAnywhere', newSession, {
    enabled: route._tag === 'Project',
  });
  const drafts = Dictation.useDraftsShown();
  const microphones = useRef<((how: 'keys' | 'touch') => void) | null>(null);
  // The Dictation itself is handed down, never its State, which moves
  // with every level heard: what reads it draws again, nothing else.
  const dictating = useMemo(
    () => ({
      dictation: children.dictation,
      ask: (ask: typeof Ask.Type) => send({ _tag: 'DictationAsked', ask }),
      microphones: (
        <MicrophonePicker.button instance={children.microphonePicker} />
      ),
      chooseMicrophone: () => microphones.current?.('touch'),
      shown: drafts.shown,
    }),
    [children.dictation, children.microphonePicker, send, drafts.shown],
  );
  Dictation.useDictationKeys(dictating.ask);
  return (
    <Dictation.Dictating value={dictating}>
      <MicrophonePicker.Opener value={microphones}>
        <Screen
          route={route}
          floating={floating}
          sidebarWidth={sidebarWidth}
          onSidebarResized={(width) => send({ _tag: 'SidebarResized', width })}
          sidebar={
            <>
              {/* On a phone the sidebar is home, so it says what home would. */}
              {children.machines && (
                <div className="md:hidden">
                  <MachineList.view instance={children.machines} />
                </div>
              )}
              <Sidebar.view instance={children.sidebar} />
            </>
          }
          foot={
            <Sidebar.Foot
              email={email}
              accounts={<AccountSwitcherList instance={children.account} />}
              projectPicker={
                <ProjectPicker.button instance={children.projectPicker} />
              }
            />
          }
          header={{
            title: <Header.view instance={children.header} />,
            actions: (
              <>
                <SessionActions.view instance={children.sessionActions} />
                {route._tag === 'Project' && (
                  <Header.Offline machineId={route.machineId} />
                )}
                {/* A phone has these in the sidebar's foot. Set a little
                    apart from the page's own actions. */}
                <div className="ml-2 hidden items-center gap-1 md:flex">
                  <ThemeToggle />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={settings}
                    aria-label={inSettings ? 'Leave Settings' : 'Settings'}
                    aria-pressed={inSettings}
                    className="size-8 shrink-0 text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
                  >
                    <SettingsIcon />
                  </Button>
                  <Account />
                </div>
              </>
            ),
          }}
        >
          {/* Opened by keys, or from elsewhere: no button of their own here. */}
          <SessionSwitcher.view instance={children.sessionSwitcher} />
          <ProjectPicker.view instance={children.projectPicker} />
          <MicrophonePicker.view instance={children.microphonePicker} />
          <KeysPicker.view instance={children.keysPicker} />
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
            <p className="mx-auto w-full max-w-4xl px-6 py-10 text-sm text-muted-foreground">
              Nothing lives at this address.{' '}
              <Router.Link
                to={routes.home()}
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
        <Toasts />
      </MicrophonePicker.Opener>
    </Dictation.Dictating>
  );
}

/**
 * The App Shell inside the keyboard: the whole sidebar is the `sidebar`
 * Surface and the whole page, its header too, the `content` one, and the
 * shell floats as a window when asked to. The sidebar is resized by its
 * edge, drawn at once and kept once the drag rests. The page draws its own
 * Status Line.
 */
function Screen({
  route,
  floating,
  sidebarWidth,
  onSidebarResized,
  sidebar,
  foot,
  header,
  children,
}: {
  readonly route: Route;
  /** Whether the shell floats as a window on a wide screen. */
  readonly floating: boolean;
  /** The sidebar's width on a wide screen, as kept. */
  readonly sidebarWidth: number;
  /** The sidebar dragged to a new width, once the drag rests. */
  readonly onSidebarResized: (width: number) => void;
  readonly sidebar: ReactNode;
  /** Two buttons, over the sidebar on a phone, under it when wide. */
  readonly foot: ReactNode;
  readonly header: ComponentProps<typeof AppShell>['header'];
  readonly children: ReactNode;
}) {
  const { vim } = keys.useKeyboard();
  // Its help opens the Keys Picker, as Ctrl+? does.
  const help = keys
    .useAvailableActions()
    .find(({ id }) => id === 'app.helpAnywhere');
  // A touch screen with no keyboard has no use for the keys' status line.
  const { keyboard } = useDevice();
  const [width, setWidth] = useState(sidebarWidth);
  // Kept from here or another tab: shown as kept.
  useEffect(() => setWidth(sidebarWidth), [sidebarWidth]);
  const rest = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(rest.current), []);
  const resize = (next: number) => {
    setWidth(next);
    clearTimeout(rest.current);
    rest.current = setTimeout(() => onSidebarResized(next), 300);
  };
  return (
    <AppShell
      // Floating as a window is a choice in Settings, for demos.
      floating={floating}
      // In Vim Mode the keys' own status line is at the shell's foot,
      // saying the Mode and where the keys are.
      vim={{
        on: vim.on && keyboard,
        statusLine: <KeysStatusBar keys={keys} onHelp={help?.run} />,
      }}
      // On a phone the sidebar is a page of its own: home.
      sidebarMode="fullscreen"
      sidebar={{
        width,
        onWidthChange: resize,
        content: (
          <keys.Surface id="sidebar" asChild>
            <div className="relative flex min-h-0 flex-1 flex-col rounded-xl pt-2 md:mx-2">
              <SidebarSwitch route={route} />
              <Sidebar.PullToReload>
                {/* On a phone, room under the last row for the foot that floats over it. */}
                <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto max-md:pb-24">
                  {sidebar}
                </div>
              </Sidebar.PullToReload>
              {/* The App Shell keeps it above the home indicator. */}
              {foot}
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
      <div
        data-scroll-restoration-id="page"
        className="relative flex h-full min-h-0 flex-col overflow-y-auto"
      >
        {children}
      </div>
    </AppShell>
  );
}

/**
 * `b` shows or hides the sidebar. Hiding it while
 * the keyboard is in it goes to the page, so focus is never left in what
 * is hidden. Not kept: the App Shell holds whether it is open, open on a
 * wide screen, and on a phone, where it is the whole screen, open at home
 * and shut on any other page, which the header's back arrow opens it from,
 * and shut again by any move to a page, such as a new session started
 * from it.
 */

function SidebarSwitch({ route }: { readonly route: Route }) {
  const shell = useAppShell();
  const { active, enter } = keys.useKeyboard();
  const home = route._tag === 'Home';
  const at = JSON.stringify(route);
  // On a phone the sidebar is home: open there, and shut anywhere else.
  const { isMobile, setOpen } = shell;
  useEffect(() => {
    if (isMobile) setOpen(home);
  }, [isMobile, at, setOpen]);
  const toggle = () => {
    if (shell.open && active === 'sidebar') enter('content');
    shell.toggle();
  };
  keys.useAction('app.sidebar', toggle);
  keys.useAction('app.sidebarAnywhere', toggle);
  return null;
}
