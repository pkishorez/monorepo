/*
 * The Routes the app moves to and links to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself, and only the root page does. The app is on every Machine at
 * once, so home and Settings' pages are on none; only a project and a session,
 * `/m/:machineId/p/:projectId`, name the Machine they are on. Views link
 * through these and read where the app is as a `Route`.
 * The shell's `router.test.ts` checks each against the router's own.
 */

/** Home, `/`: every Machine's projects. */
export const home = () => ({ _tag: 'Home' as const });

/** One page of Settings, General unless said. */
export type SettingsTab = 'General' | 'Shortcuts' | 'Machines';

/**
 * Settings, `/settings/general` unless another page of them is named:
 * this device's, its keys, and every Machine's.
 */
export const settings = (tab: SettingsTab = 'General') => ({
  _tag: 'Settings' as const,
  page: { _tag: tab },
});

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
  | {
      readonly _tag: 'Settings';
      readonly page?:
        | { readonly _tag: 'General' }
        | { readonly _tag: 'Shortcuts' }
        | { readonly _tag: 'Machines' };
    }
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
