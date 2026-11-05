import { View, useChild } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/view';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  createContext,
  Suspense,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Page } from '../app.ts';
import { SignInScreen, StartScreen } from '../sign-in/index.ts';
import { behindAll, Links } from './connection/link/index.ts';
import { Frame } from './frame/index.ts';
import { Home } from './pages/home/index.ts';
import { Project } from './pages/project/index.ts';
import { Draft } from './pages/project/draft/index.ts';
import { Session } from './pages/project/session/index.ts';
import { Settings } from './pages/settings/index.ts';
import { AccountLive, fetching } from './actor.ts';

/*
 * The Account's page as it stands. `Away`: the mark while who is signed
 * in is not heard yet, or while the page leaves for another Account's
 * home, after a switch asked in this tab; checking, while the Auth Worker
 * is still asked; else the sign-in screen, saying why, with the Accounts
 * signed in here to switch to (`sign-in/`). Active: the app, on every Connection at once,
 * the frame (`frame/`) around the page the URL names, handed the Account
 * Switcher for its header and its list for the sidebar's foot, and on a
 * phone, over the sidebar, what home would say of the Connections. Every
 * Connection as listed, with its link now, whether its Last Seen is
 * believed yet, and who is behind on one that refused this Code's Release
 * of the code Plugin, is handed to the Views below through `Links`. Each
 * part is handed its own Instance, never its data, so a change to one
 * draws only it. A page's code loads on its own (`usePreloaded`). The mark
 * stays until the frame is shown: until then it draws nothing, and the
 * page says when it can be drawn whole (`PageReady`), its code loaded and
 * what it reads read from this device, never waiting on a Connection.
 */

/** What the root page hands the Account's page: the Account Switcher, for the header, and its list, for the sidebar's foot. */
export const Switcher = createContext<{
  readonly account: ReactNode;
  readonly accounts: ReactNode;
}>({ account: null, accounts: null });

type Self = ViewProps<typeof AccountLive>;
type Active = Extract<Self, { readonly _tag: 'Active' }>;

export const AccountView = View.make(AccountLive, (self) =>
  self._tag === 'Active' && self.model.leaving === null ? (
    <Drawn {...self} />
  ) : (
    <Elsewhere {...self} />
  ),
);

/** The mark, where the start screens draw it. */
const mark = <StartScreen start="reading" problem={null} onSignIn={() => {}} />;

/** In place of the app: why the Account is not drawn, and the sign-in screen. */
function Elsewhere({ root, model, state, props, send }: Self) {
  const { who, leaving } = model;
  const moving =
    who === null ||
    (leaving !== null &&
      (state._tag === 'Active' || who.active?.id === leaving));
  return (
    <div {...root}>
      {moving || state._tag === 'Active' ? (
        mark
      ) : !who.answered ? (
        <StartScreen start="checking" problem={null} onSignIn={() => {}} />
      ) : (
        <SignInScreen
          away={{
            why: state.why,
            accounts: who.accounts,
            own: props.params.accountId,
            switching: who.switchingTo ?? leaving,
            answered: who.answered,
          }}
          problem={model.problem}
          leaving={model.signingIn}
          onSignIn={() => send({ _tag: 'SignInAsked' })}
          onChoose={(id) => send({ _tag: 'ChooseAsked', id })}
        />
      )}
    </div>
  );
}

/** The app, for the Account active. */
function Drawn({ root, model, props, children, send }: Active) {
  const loaded = usePreloaded(children);
  const frame =
    children.frame ?? (NONE as NonNullable<Active['children']['frame']>);
  // The frame draws nothing until it is shown: the mark stays meanwhile.
  const shown = useChild(frame, ({ model }) => model.shown) === true;
  const ready = usePageReady(children, props.route.page) && loaded;
  const switcher = use(Switcher);
  const { value: connections, problem, keptRead } = model.list;
  const busy = fetching(model);
  const links = useMemo(
    () => ({
      connections,
      status: model.links,
      checked: model.checked,
      behind: behindAll(model.said),
    }),
    [connections, model.links, model.checked, model.said],
  );
  const none = useMemo(
    () => (
      <None
        list={{ connections, problem, keptRead }}
        fetching={busy}
        onReload={() => send({ _tag: 'ReloadAsked' })}
      />
    ),
    [connections, problem, keptRead, busy, send],
  );
  const given = useMemo(
    () => ({
      page: (
        <Suspense fallback={null}>
          <PageOf children={children} none={none} />
        </Suspense>
      ),
      ready,
      // On a phone the sidebar is home, so it says what home would.
      connections: <div className="md:hidden">{none}</div>,
      account: switcher.account,
      accounts: switcher.accounts,
    }),
    [children.Home, children.Settings, children.Project, none, ready, switcher],
  );
  return (
    <div {...root}>
      {(children.frame === undefined || !shown) && mark}
      {children.frame !== undefined && (
        <Links value={links}>
          <Frame.Given value={given}>
            <Frame.view instance={children.frame} />
            {!shown && <PageReady children={children} />}
          </Frame.Given>
        </Links>
      )}
    </div>
  );
}

/** Loads the code of each page whose code loads apart. */
const pages = {
  settings: () => Settings.view.preload(),
  // A Session's page, and the Draft on both.
  project: () =>
    Promise.all([
      Project.view.preload(),
      Project.ready.preload(),
      Session.view.preload(),
      Session.ready.preload(),
      Draft.preload(),
    ]).then(() => {}),
};

/**
 * The code of the pages not in the first bundle: the page the URL names,
 * with what it draws, as the app starts, beside reading who is signed in,
 * so it draws whole; every other once the browser is idle, so a move to
 * one never waits on it. A move preloads its own too. Says whether the
 * code of the page named is loaded; a page in the first bundle always is.
 */
function usePreloaded(children: Active['children']) {
  const named = children.Settings
    ? 'settings'
    : children.Project
      ? 'project'
      : null;
  const [loaded, setLoaded] = useState<ReadonlyArray<string>>([]);
  const load = (name: keyof typeof pages) =>
    pages[name]().then(
      () => setLoaded((all) => (all.includes(name) ? all : [...all, name])),
      () => {},
    );
  useEffect(() => {
    if (named) load(named);
  }, [named]);
  useEffect(() => {
    const all = () => {
      load('settings');
      load('project');
    };
    if (typeof requestIdleCallback === 'undefined') {
      const timer = setTimeout(all, 1000);
      return () => clearTimeout(timer);
    }
    const idle = requestIdleCallback(all, { timeout: 3000 });
    return () => cancelIdleCallback(idle);
  }, []);
  return named === null || loaded.includes(named);
}

/** No Instance: what a Hook reads while a Child is absent. */
const NONE = { id: '' };

/**
 * Whether the page the URL names can be drawn whole, as it said
 * (`PageReady`): a project at the place in it the URL names; a page that
 * reads nothing first, or no page, always can.
 */
function usePageReady(children: Active['children'], page: Page | undefined) {
  const home = useChild(
    children.Home ?? (NONE as NonNullable<Active['children']['Home']>),
    ({ model }) => model.ready,
  );
  const project = useChild(
    children.Project ?? (NONE as NonNullable<Active['children']['Project']>),
    ({ model }) => model.ready,
  );
  if (children.Home) return home === true;
  if (children.Project)
    return (
      project ===
      Project.placeIn(page?._tag === 'Project' ? page.page : undefined)
    );
  return true;
}

/**
 * Draws nothing: the page the URL names, saying once it can be drawn
 * whole, read from this device, before the frame is first drawn and after
 * each move to it.
 */
function PageReady({ children }: { readonly children: Active['children'] }) {
  if (children.Home) return <Home.ready instance={children.Home} />;
  if (children.Project)
    return (
      <Suspense fallback={null}>
        <Project.ready instance={children.Project} />
      </Suspense>
    );
  return null;
}

/**
 * The page the URL names. An address under the Account that names no page
 * is no Account's page: the root page says nothing lives there.
 */
function PageOf({
  children,
  none,
}: {
  readonly children: Active['children'];
  /** What home says while there is no Connection to show. */
  readonly none: ReactNode;
}) {
  if (children.Home)
    return (
      <>
        {none}
        <Home.view instance={children.Home} />
      </>
    );
  if (children.Project) return <Project.view instance={children.Project} />;
  if (children.Settings) return <Settings.view instance={children.Settings} />;
  return null;
}

/** The command that makes this computer one of the Account's Connections. */
export const serveCommand = () => 'npx @kestack/connect serve';

/**
 * What home shows in place of the projects while there is no Connection to
 * show them from: Connect Cloud out of reach with no list kept on this
 * device, saying so and why, with a way to ask again; or no Connection at
 * all, with how to start one. Nothing otherwise, and nothing until the
 * list kept here has been read, so a kept list never follows either.
 */
function None({
  list: { connections, problem, keptRead },
  fetching,
  onReload,
}: {
  readonly list: {
    readonly connections: ReadonlyArray<unknown> | null;
    readonly problem: string | null;
    readonly keptRead: boolean;
  };
  readonly fetching: boolean;
  readonly onReload: () => void;
}) {
  // Never listed on this device: the page says it is loading meanwhile.
  if (!keptRead || (connections === null && problem === null)) return null;
  if (connections === null)
    return (
      <Screen>
        <h1 className="text-lg font-semibold">Can't reach Connect Cloud</h1>
        <p className="text-sm text-muted-foreground">
          Your Connections are listed by Connect Cloud, and this device has no
          list of them kept yet, so there is nothing to show until it answers.
        </p>
        <p className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-words">
          {problem}
        </p>
        <Button variant="outline" disabled={fetching} onClick={onReload}>
          {fetching ? 'Trying…' : 'Try again'}
        </Button>
      </Screen>
    );
  if (connections.length > 0) return null;
  return (
    <Screen>
      <h1 className="text-lg font-semibold">No Connection yet</h1>
      <p className="text-sm text-muted-foreground">
        A Connection is a computer that runs your sessions. Run this on one,
        sign in as you are here, and it shows up in a few seconds:
      </p>
      <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
        {serveCommand()}
      </pre>
      <Button variant="outline" disabled={fetching} onClick={onReload}>
        {fetching ? 'Looking…' : 'Look again'}
      </Button>
    </Screen>
  );
}

function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 px-6 py-10">
      {children}
    </main>
  );
}
