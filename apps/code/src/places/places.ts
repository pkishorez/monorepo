/*
 * The Routes the app moves to and links to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself, and only the root page does. The app is on every Machine at
 * once, so home and Settings are on none; only a project and a session,
 * `/m/:machineId/p/:projectId`, name the Machine they are on. Views link
 * through these and read where the app is as a `Place`.
 * `shell/places.test.ts` checks each against the router's own.
 */

/** Home, `/`: every Machine's projects. */
export const home = () => ({ _tag: 'Home' as const });

/** Settings, `/settings`: every Machine's, and this device's. */
export const settings = () => ({ _tag: 'Settings' as const });

/** A project of one Machine: a new session in it. */
export const project = (machineId: string, projectId: string) => ({
  _tag: 'Machine' as const,
  machineId,
  page: { _tag: 'Project' as const, projectId },
});

export const session = (
  machineId: string,
  projectId: string,
  sessionId: string,
) => ({
  _tag: 'Machine' as const,
  machineId,
  page: {
    _tag: 'Project' as const,
    projectId,
    page: { _tag: 'Session' as const, sessionId },
  },
});

/** Where the app is: one of the places above, or an address that names none. */
export type Place =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'Settings' }
  | {
      readonly _tag: 'Project';
      readonly machineId: string;
      readonly projectId: string;
      readonly page?: { readonly _tag: 'Session'; readonly sessionId: string };
    }
  | { readonly _tag: 'NotFound'; readonly path: string };

/** Where the app is, as the router reads it. */
export type Route =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'Settings' }
  | {
      readonly _tag: 'Machine';
      readonly machineId: string;
      readonly page?: {
        readonly _tag: 'Project';
        readonly projectId: string;
        readonly page?: {
          readonly _tag: 'Session';
          readonly sessionId: string;
        };
      };
    }
  | { readonly _tag: 'NotFound'; readonly path: string };

/** Where a Route is: a Machine with no project names no place. */
export const placeOf = (route: Route): Place =>
  route._tag !== 'Machine'
    ? route
    : route.page === undefined
      ? { _tag: 'NotFound', path: `/m/${route.machineId}` }
      : { ...route.page, machineId: route.machineId };

/** The Machine a page under it is on, from the params its route carries down. */
export const machineIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['machineId'] ?? '');

/** The project a page under it is in, from the params its route carries down. */
export const projectIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['projectId'] ?? '');
