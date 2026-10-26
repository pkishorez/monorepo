/*
 * The Routes the app moves to and links to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself, and only the root page does. The app is on every Machine at
 * once, so home and Settings are on none; only a project and a session,
 * `/m/:machineId/p/:projectId`, name the Machine they are on. Views link
 * through these and read where the app is as a `Route`. A tab of Settings
 * has no address: a link that wants one asks for it apart.
 * The shell's `router.test.ts` checks each against the router's own.
 */

/** Home, `/`: every Machine's projects. */
export const home = () => ({ _tag: 'Home' as const });

/** The tabs of Settings, in their order. */
export const SETTINGS_TABS = ['General', 'Shortcuts', 'Machines'] as const;

/** One tab of Settings. */
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Settings, `/settings`: this device's, its keys, and every Machine's, in
 * tabs that have no address of their own.
 */
export const settings = () => ({ _tag: 'Settings' as const });

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

/** `/kabuki`, a prototype: the app's own Actor tree, open signed in or not. */
export const kabuki = () => ({ _tag: 'Kabuki' as const });

/** A project of one Machine: a new session in it. */
export const project = (machineId: string, projectId: string) => ({
  _tag: 'Project' as const,
  machineId,
  projectId,
});

export const session = (
  machineId: string,
  projectId: string,
  sessionId: string,
) => ({
  _tag: 'Project' as const,
  machineId,
  projectId,
  page: { _tag: 'Session' as const, sessionId },
});

/** Where the app is: one of the Routes above, or an address that names none. */
export type Route =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'Settings' }
  | { readonly _tag: 'Kabuki' }
  | {
      readonly _tag: 'Project';
      readonly machineId: string;
      readonly projectId: string;
      readonly page?: { readonly _tag: 'Session'; readonly sessionId: string };
    }
  | { readonly _tag: 'NotFound'; readonly path: string };

/** The Machine a page under it is on, from the params its route carries down. */
export const machineIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['machineId'] ?? '');

/** The project a page under it is in, from the params its route carries down. */
export const projectIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['projectId'] ?? '');
