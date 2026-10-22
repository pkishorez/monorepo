/*
 * The Routes the app moves to and links to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself, and only the root page does. Every place but the root is on one
 * Machine, `/m/:machineId`, so each takes the Machine's id first. Views
 * link through these and read where the app is on its Machine as a
 * `Place`. `shell/places.test.ts` checks each against the router's own.
 */

/** The root, `/`: on no Machine yet. */
export const root = () => ({ _tag: 'Open' as const });

/** A Machine, at its home: its projects. */
export const machine = (machineId: string) => ({
  _tag: 'Machine' as const,
  machineId,
});

export const home = (machineId: string) => ({
  _tag: 'Machine' as const,
  machineId,
  page: { _tag: 'Home' as const },
});

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

export const settings = (machineId: string) => ({
  _tag: 'Machine' as const,
  machineId,
  page: { _tag: 'Settings' as const },
});

/** Where the app is on its Machine: one of the places above, or an address that names none. */
export type Place =
  | { readonly _tag: 'Home' }
  | {
      readonly _tag: 'Project';
      readonly projectId: string;
      readonly page?: { readonly _tag: 'Session'; readonly sessionId: string };
    }
  | { readonly _tag: 'Settings' }
  | { readonly _tag: 'NotFound'; readonly path: string };

/** Where the app is: the root, a Machine and where on it, or an address that names none. */
export type Route =
  | { readonly _tag: 'Open' }
  | {
      readonly _tag: 'Machine';
      readonly machineId: string;
      readonly page?: Exclude<Place, { readonly _tag: 'NotFound' }>;
    }
  | { readonly _tag: 'NotFound'; readonly path: string };

/** Where on its Machine a Route is: a Machine with no page is at its home. */
export const placeOf = (route: Route): Place =>
  route._tag === 'Machine'
    ? (route.page ?? { _tag: 'Home' })
    : route._tag === 'NotFound'
      ? route
      : { _tag: 'Home' };

/** The Machine a Route is on, if any. */
export const machineOf = (route: Route): string | null =>
  route._tag === 'Machine' ? route.machineId : null;

/** The Machine a page under it is on, from the params its route carries down. */
export const machineIn = (params: Readonly<Record<string, unknown>>): string =>
  String(params['machineId'] ?? '');
