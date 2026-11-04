import { useRouter } from '@kestack/kabuki/routing';

/*
 * The Routes the app moves to and links to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself, and only the root page does. Every page is one Account's, under
 * `/a/:accountId`: home and Settings are on no Connection; only a project
 * and a session, `…/m/:connectionId/p/:projectId`, name the Connection
 * they are on. Views link through these and read where the app is as a
 * `Route`. A tab of Settings has no address: a link that wants one asks
 * for it apart. `router.test.ts` checks each against the router's own.
 *
 * 1. Pages    each page's Route, for the Account it is under.
 * 2. Read     where a Route is: its Account, and its page.
 * 3. Old      the addresses the app had before its pages were an
 *             Account's, read as the same page under the Account active.
 */

// 1. Pages
/** Home, `/a/:accountId`: every Connection's projects. */
export const home = (accountId: string) => ({
  _tag: 'Account' as const,
  accountId,
  page: { _tag: 'Home' as const },
});

/** The tabs of Settings, in their order. */
export const SETTINGS_TABS = [
  'General',
  'Shortcuts',
  'Connections',
  'About',
] as const;

/** One tab of Settings. */
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Settings, `/a/:accountId/settings`: this device's, its keys, and every
 * Connection's, in tabs that have no address of their own.
 */
export const settings = (accountId: string) => ({
  _tag: 'Account' as const,
  accountId,
  page: { _tag: 'Settings' as const },
});

let asked: SettingsTab = 'General';

/**
 * Asks that Settings, opened next, open on `tab`: a link to them that
 * wants one asks as it is followed. Asked once; General unless asked.
 */
export const openSettingsOn = (tab: SettingsTab) => {
  asked = tab;
};

/** The tab Settings open on, as they open: the one asked, which goes, else General. */
export const settingsTabAsked = (): SettingsTab => {
  const tab = asked;
  asked = 'General';
  return tab;
};

/** A project of one Connection: a new session in it. */
export const project = (
  accountId: string,
  connectionId: string,
  projectId: string,
) => ({
  _tag: 'Account' as const,
  accountId,
  page: { _tag: 'Project' as const, connectionId, projectId },
});

export const session = (
  accountId: string,
  connectionId: string,
  projectId: string,
  sessionId: string,
) => ({
  _tag: 'Account' as const,
  accountId,
  page: {
    _tag: 'Project' as const,
    connectionId,
    projectId,
    page: { _tag: 'Session' as const, sessionId },
  },
});

/** A page of an Account: one of the pages above. */
export type Page =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'Settings' }
  | {
      readonly _tag: 'Project';
      readonly connectionId: string;
      readonly projectId: string;
      readonly page?: { readonly _tag: 'Session'; readonly sessionId: string };
    };

/** Where the app is: an Account, at one of its pages, or an address that names none. */
export type Route =
  | {
      readonly _tag: 'Account';
      readonly accountId: string;
      readonly page?: Page;
    }
  | { readonly _tag: 'NotFound'; readonly path: string };

// 2. Read
/** The Account `route` is under; empty for none. */
export const accountOf = (route: Route): string =>
  route._tag === 'Account' ? route.accountId : '';

/** The Account the app is at, for a View; empty for none. */
export const useAccountId = () => accountOf(useRouter<Route>().route);

/** The page `route` is at; null for none. */
export const pageOf = (route: Route): Page | null =>
  route._tag === 'Account' ? (route.page ?? null) : null;

/** The Account a page under it is of, from the params its route carries down. */
export const accountIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['accountId'] ?? '');

/** The Connection a page under it is on, from the params its route carries down. */
export const connectionIn = (
  params: Readonly<Record<string, unknown>>,
): string => String(params['connectionId'] ?? '');

/** The project a page under it is in, from the params its route carries down. */
export const projectIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['projectId'] ?? '');

// 3. Old
/**
 * The page an address the app had before is, under `accountId`: `/`,
 * `/settings` and its tabs, and a project or a session of a Connection,
 * `/m/:connectionId/p/:projectId(/s/:sessionId)`; null for any other.
 */
export const before = (path: string, accountId: string) => {
  const parts = path.split('/').filter((part) => part !== '');
  const [m, connectionId, p, projectId, s, sessionId, ...rest] = parts;
  if (parts.length === 0) return home(accountId);
  if (m === 'settings' && parts.length <= 2) return settings(accountId);
  if (m !== 'm' || p !== 'p' || connectionId === undefined) return null;
  if (projectId === undefined) return null;
  if (s === undefined) return project(accountId, connectionId, projectId);
  return s === 's' && sessionId !== undefined && rest.length === 0
    ? session(accountId, connectionId, projectId, sessionId)
    : null;
};
