import { View, useChild } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import type { ViewProps } from '@kestack/kabuki/react/view';
import {
  AccountSwitcherList,
  AccountSwitcherView,
} from '@kestack/web-platform/recipes/account-switcher';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StartScreen, startOf } from './account/index.ts';
import { Connections as ConnectionsActor } from './account/connections/index.ts';
import {
  behindAll,
  Links,
} from './account/connections/connection/link/index.ts';
import { Layout } from './account/connections/layout/index.ts';
import { Home } from './account/connections/layout/pages/home/index.ts';
import { Project } from './account/connections/layout/pages/project/index.ts';
import { Draft } from './account/connections/layout/pages/project/draft/index.ts';
import { Session } from './account/connections/layout/pages/project/session/index.ts';
import { Settings } from './account/connections/layout/pages/settings/index.ts';
import { Kabuki } from './kabuki/index.ts';
import * as routes from './routes/index.ts';
import { DeviceLive } from './actor.ts';

/*
 * The root page's View, as the Account step goes: the mark, signing in, or
 * checking who is, while no Account is drawn, or its keyboard is read;
 * else the app, drawn for the Account the root page draws, on every
 * Connection at once, its Connections' and no other's: their Voice
 * (`account/connections/voice/`) around Layout (`account/connections/layout/`),
 * around the page the URL names, handed the Account Switcher for its
 * header and its list for the sidebar's foot, and on a phone, over the
 * sidebar, what home would say of the Connections. Every Connection as listed,
 * with its link now, whether its Last Seen is believed yet, and who is behind on one that
 * refused this Code's Release of the code Plugin, is handed to the Views below through `Links`.
 * Each part is handed its own Instance, never its data, so a change to
 * one draws only it. A page's code loads on its own (`usePreloaded`).
 * The mark stays until Layout is shown: until then it draws nothing, and
 * the page says when it can be drawn whole (`PageReady`), its code loaded
 * and what it reads read from this device, never waiting on a Connection.
 */

type Self = ViewProps<typeof DeviceLive>;

export const DeviceView = View.make(
  DeviceLive,
  ({ root, model, state, props, children, send }) => {
    const loaded = usePreloaded(children);
    const layout =
      children.layout ?? (NONE as NonNullable<Self['children']['layout']>);
    // Layout draws nothing until it is shown: the mark stays meanwhile.
    const shown = useChild(layout, ({ model }) => model.shown) === true;
    const ready = usePageReady(children, props.route.page) && loaded;
    // A prototype: the app's Actor tree, open to anyone, signed in or not.
    if (children.Kabuki)
      return (
        <div {...root}>
          <Suspense fallback={null}>
            <Kabuki.view instance={children.Kabuki} />
          </Suspense>
        </div>
      );
    // The Connections of the Account drawn, not of one preparing.
    const connections = children.connections.find(
      ({ key }) => key === model.drawn?.id,
    );
    const app = model.drawn !== null && children.layout !== undefined;
    return (
      <div {...root}>
        {(!app || !shown) && (
          <StartScreen
            start={startOf(state)}
            problem={model.signInProblem}
            onSignIn={() => send({ _tag: 'SignInAsked' })}
          />
        )}
        {app && (
          <Connections connections={connections}>
            <Spoken connections={connections}>
              <Layout.Given
                value={{
                  page: (
                    <Suspense fallback={null}>
                      <PageOf children={children} connections={connections} />
                    </Suspense>
                  ),
                  ready,
                  // On a phone the sidebar is home, so it says what home would.
                  connections: connections && (
                    <div className="md:hidden">
                      <ConnectionsActor.view instance={connections} />
                    </div>
                  ),
                  account: <AccountSwitcherView instance={children.account} />,
                  accounts: <AccountSwitcherList instance={children.account} />,
                }}
              >
                <Layout.view instance={children.layout} />
                {!shown && <PageReady children={children} />}
              </Layout.Given>
            </Spoken>
          </Connections>
        )}
      </div>
    );
  },
);

/** Loads the code of each page whose code loads apart, but the Kabuki page's. */
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
function usePreloaded(children: Self['children']) {
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
function usePageReady(
  children: Self['children'],
  route: routes.Route | undefined,
) {
  const home = useChild(
    children.Home ?? (NONE as NonNullable<Self['children']['Home']>),
    ({ model }) => model.ready,
  );
  const project = useChild(
    children.Project ?? (NONE as NonNullable<Self['children']['Project']>),
    ({ model }) => model.ready,
  );
  if (children.Home) return home === true;
  if (children.Project)
    return (
      project ===
      Project.placeIn(route?._tag === 'Project' ? route.page : undefined)
    );
  return true;
}

/**
 * Draws nothing: the page the URL names, saying once it can be drawn
 * whole, read from this device, before Layout is first drawn and after
 * each move to it.
 */
function PageReady({ children }: { readonly children: Self['children'] }) {
  if (children.Home) return <Home.ready instance={children.Home} />;
  if (children.Project)
    return (
      <Suspense fallback={null}>
        <Project.ready instance={children.Project} />
      </Suspense>
    );
  return null;
}

/** The Connections of the Account drawn. */
type Drawn = Self['children']['connections'][number] | undefined;

/** The page the URL names, or that nothing lives there. */
function PageOf({
  children,
  connections,
}: {
  readonly children: Self['children'];
  readonly connections: Drawn;
}) {
  if (children.Home)
    return (
      <>
        {connections && <ConnectionsActor.view instance={connections} />}
        <Home.view instance={children.Home} />
      </>
    );
  if (children.Project) return <Project.view instance={children.Project} />;
  if (children.Settings) return <Settings.view instance={children.Settings} />;
  return (
    <p className="mx-auto w-full max-w-4xl px-6 py-10 text-sm text-muted-foreground">
      Nothing lives at this address.{' '}
      <Router.Link
        to={routes.home()}
        className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
      >
        Go to your projects
      </Router.Link>
    </p>
  );
}

/**
 * Voice, around the screen: the Dictation of the Account drawn, which
 * every Draft and Layout reach, and which carries on across pages.
 */
function Spoken({
  connections,
  children,
}: {
  readonly connections: Drawn;
  readonly children: ReactNode;
}) {
  if (connections === undefined) return children;
  return (
    <ConnectionsActor.Around value={children}>
      <ConnectionsActor.voice instance={connections} />
    </ConnectionsActor.Around>
  );
}

/**
 * Every Connection as the Views see it, as listed and with its link now. Only
 * this provider draws again as they change, and what reads them.
 */
function Connections({
  connections,
  children,
}: {
  readonly connections: Drawn;
  readonly children: ReactNode;
}) {
  if (connections === undefined)
    return (
      <Links value={{ connections: null, status: {}, checked: false }}>
        {children}
      </Links>
    );
  return <Listed connections={connections}>{children}</Listed>;
}

function Listed({
  connections,
  children,
}: {
  readonly connections: NonNullable<Drawn>;
  readonly children: ReactNode;
}) {
  const known = useChild(connections, ({ model }) => model);
  const value = useMemo(
    () => ({
      connections: known?.list.value ?? null,
      status: known?.links ?? {},
      checked: known?.checked ?? false,
      behind: behindAll(known?.list.value ?? null, known?.mismatched ?? {}),
    }),
    [known?.list.value, known?.links, known?.checked, known?.mismatched],
  );
  return <Links value={value}>{children}</Links>;
}
