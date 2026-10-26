import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { AppShell, useAppShell } from '@kestack/web-platform/recipes/frame';
import { Button } from '@kestack/web-platform/ui/components/button';
import { SettingsIcon } from 'lucide-react';
import { useDevice } from '@kestack/web-platform/ui/input';
import { KeysStatusBar } from '@kestack/web-platform/recipes/keyboard';
import {
  createContext,
  use,
  useEffect,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { keys, useBound } from './commands.ts';
import type { Route } from '../../../routes/index.ts';
import { Theme, ThemeToggle } from '../../../../ui/page/theme/index.ts';
import { Toasts } from '../../../../ui/controls/notice/index.ts';
import { Voice } from '../voice/index.ts';
import { Pickers } from './pickers/index.ts';
import { Sidebar, type Width } from './sidebar/index.ts';
import { LayoutLive, rowRead } from './actor.ts';
import { HeaderTitle, Keyboard, Offline, useVoiceKeys } from './layout.tsx';

/*
 * Layout's View: the keyboard over everything, with the Bindings from
 * Preferences (`layout.tsx`), around the page the root page hands it, drawn
 * at once: in the Web Platform's App Shell, the sidebar (`sidebar/`), at
 * the width it keeps, the header with where you are (`layout.tsx`),
 * Actions, the Connection of the page while it is out of reach, the
 * mic, the Account and the theme, and the page; the Pickers (`pickers/`)
 * drawn around all of it, each placing its own; and what Voice draws, the
 * Microphone Picker and the Dictation's badge (`../voice/`). Each part is
 * handed its own Instance, never its data, so a change to one draws only
 * it. The sidebar and the page are Surfaces of the keyboard. From
 * anywhere, `n` starts a session in the project open, `b` shows or hides
 * the sidebar, Ctrl+, goes to Settings and, again or by Escape, back,
 * Ctrl+O and Ctrl+I go Back and Forward, Space and Ctrl+Space start and
 * stop a Dictation, `d` chooses the microphone, and in Vim Mode `t`
 * switches the theme.
 *
 * Until it is shown, it draws nothing, the root page's mark staying, and
 * says once that all it first draws is read from this device: the
 * sidebar, the header's rows and the page the root page hands it; then it
 * is drawn whole, in one step.
 */

/**
 * What the root page hands Layout to draw: the page the URL names; on a
 * phone, over the sidebar, what home would say of the Connections; and the
 * Account Switcher, for the header, and its list, for the sidebar's foot.
 */
export const Given = createContext<{
  readonly page: ReactNode;
  /** Whether the page can be drawn whole: its code loaded, what it reads read. */
  readonly ready: boolean;
  readonly connections: ReactNode;
  readonly account: ReactNode;
  readonly accounts: ReactNode;
}>({
  page: null,
  ready: true,
  connections: null,
  account: null,
  accounts: null,
});

type Self = ViewProps<typeof LayoutLive>;

export const LayoutView = View.make(
  LayoutLive,
  ({ props, model, children, send }) => {
    const { keyboard } = model;
    if (!model.shown)
      return <Ready actors={children} place={props.place} send={send} />;
    return (
      <>
        <TextSize size={keyboard.textSize} />
        <Keyboard
          vim={keyboard.vim}
          bindings={keyboard.bindings}
          onVimChange={(on) => send({ _tag: 'VimChanged', on })}
        >
          <Pickers.Around
            value={
              <Sidebar.Sizing
                value={(width) => (
                  <Signed
                    actors={children}
                    email={props.email}
                    floating={keyboard.floating}
                    width={width}
                    send={send}
                  />
                )}
              >
                <Sidebar.width instance={children.sidebar} />
              </Sidebar.Sizing>
            }
          >
            <Pickers.view instance={children.pickers} />
          </Pickers.Around>
          <Spoken />
          <Toasts />
        </Keyboard>
      </>
    );
  },
);

/**
 * Draws nothing: says once the sidebar, the header's rows and the page
 * are read from this device for the place the app is at, so Layout is
 * first shown whole.
 */
function Ready({
  actors: children,
  place,
  send,
}: {
  readonly actors: Self['children'];
  readonly place: Self['props']['place'];
  readonly send: Self['send'];
}) {
  const sidebar = useChild(children.sidebar, ({ model }) => model.ready);
  // A Connection off the Account's list has no rows here to read.
  const listed = useChild(children.sidebar, ({ model }) =>
    model.listRead
      ? (model.connections ?? []).map(({ id }) => id).join(' ')
      : null,
  );
  const unlisted =
    place !== null &&
    listed != null &&
    !listed.split(' ').includes(place.connectionId);
  // The header's rows, while the URL names them: an absent one is read
  // through no Instance, as the Hook is called either way.
  const projectId = place === null || unlisted ? null : place.projectId;
  const sessionId = unlisted ? null : (place?.sessionId ?? null);
  const project = useChild(
    children.project ?? (NONE as NonNullable<Self['children']['project']>),
    ({ model, props }) =>
      rowRead(projectId, {
        status: model.status,
        asked: props.projectId,
        held: model.rows[0]?.row.id,
      }),
  );
  const session = useChild(
    children.session ?? (NONE as NonNullable<Self['children']['session']>),
    ({ model, props }) =>
      rowRead(sessionId, {
        status: model.status,
        asked: props.sessionId,
        held: model.rows[0]?.row.id,
      }),
  );
  const page = use(Given).ready;
  const ready =
    sidebar === true &&
    (projectId === null || project === true) &&
    (sessionId === null || session === true) &&
    page;
  useEffect(() => {
    if (ready) send({ _tag: 'Ready' });
  }, [ready]);
  // The sidebar says so once, for good.
  return sidebar === true ? null : (
    <Sidebar.ready instance={children.sidebar} />
  );
}

/** No Instance: what a Hook reads while a Child is absent. */
const NONE = { id: '' };

/** Marks `<html>` with the text size chosen, which the styles size by. */
function TextSize({ size }: { readonly size: string }) {
  useEffect(() => {
    document.documentElement.dataset.textSize = size;
  }, [size]);
  return null;
}

/** Voice inside the keyboard: its keys, and what it draws. */
function Spoken() {
  const voice = Voice.useVoice();
  useVoiceKeys(voice);
  return voice.drawn;
}

/** The app, for the Account drawn. */
function Signed({
  actors: children,
  email,
  floating,
  width,
  send,
}: {
  readonly actors: Self['children'];
  /** Who is signed in. */
  readonly email: string;
  /** Whether the app floats as a window on a wide screen. */
  readonly floating: boolean;
  /** The sidebar's width on a wide screen, and how it is dragged. */
  readonly width: Width;
  readonly send: Self['send'];
}) {
  const route = useRouter<Route>().route;
  const given = use(Given);
  const dictateKeys = useBound('app.dictate');
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
                    connectionId: route.connectionId,
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
      connectionId: route.connectionId,
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
  return (
    <Screen
      route={route}
      floating={floating}
      width={width}
      sidebar={
        <>
          {given.connections}
          <Sidebar.view instance={children.sidebar} />
        </>
      }
      foot={
        <Sidebar.Foot
          email={email}
          accounts={given.accounts}
          projectPicker={<Pickers.ProjectButton />}
        />
      }
      header={{
        title: (
          <HeaderTitle
            route={route}
            project={children.project}
            session={children.session}
          />
        ),
        actions: (
          <>
            <Pickers.SessionActionsButton />
            {route._tag === 'Project' && (
              <Offline connectionId={route.connectionId} />
            )}
            <Voice.Button keys={dictateKeys} />
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
              {given.account}
            </div>
          </>
        ),
      }}
    >
      <Pickers.ProjectNotice />
      {given.page}
    </Screen>
  );
}

/**
 * The App Shell inside the keyboard: the whole sidebar is the `sidebar`
 * Surface and the whole page, its header too, the `content` one, and the
 * shell floats as a window when asked to. The sidebar is as wide as it
 * says. The page draws its own Status Line.
 */
function Screen({
  route,
  floating,
  width,
  sidebar,
  foot,
  header,
  children,
}: {
  readonly route: Route;
  /** Whether the App Shell floats as a window on a wide screen. */
  readonly floating: boolean;
  /** The sidebar's width on a wide screen, and how it is dragged. */
  readonly width: Width;
  readonly sidebar: ReactNode;
  /** Two buttons, over the sidebar on a phone, under it when wide. */
  readonly foot: ReactNode;
  readonly header: ComponentProps<typeof AppShell>['header'];
  readonly children: ReactNode;
}) {
  const { vim } = keys.useKeyboard();
  // Its help opens the Actions list, as Ctrl+? does.
  const help = keys
    .useAvailableActions()
    .find(({ id }) => id === 'app.helpAnywhere');
  // A touch screen with no keyboard has no use for the keys' status line.
  const { keyboard } = useDevice();
  return (
    <AppShell
      // Floating as a window is a choice in Settings, for demos.
      floating={floating}
      // In Vim Mode the keys' own status line is at the App Shell's foot,
      // saying the Mode and where the keys are.
      vim={{
        on: vim.on && keyboard,
        statusLine: <KeysStatusBar keys={keys} onHelp={help?.run} />,
      }}
      // On a phone the sidebar is a page of its own: home.
      sidebarMode="fullscreen"
      sidebar={{
        width: width.width,
        onWidthChange: width.onWidthChange,
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
