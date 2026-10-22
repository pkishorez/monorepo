/*
 * The Routes the app moves to and links to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself, and only the root page does. Views link through these and read
 * where the app is as a `Place`. `shell/places.test.ts` checks each against
 * the router's own.
 */

export const home = () => ({ _tag: 'Home' as const });

export const project = (projectId: string) => ({
  _tag: 'Project' as const,
  projectId,
});

export const session = (projectId: string, sessionId: string) => ({
  _tag: 'Project' as const,
  projectId,
  page: { _tag: 'Session' as const, sessionId },
});

export const settings = () => ({ _tag: 'Settings' as const });

/** Where the app is: one of the places above, or an address that names none. */
export type Place =
  | { readonly _tag: 'Home' }
  | {
      readonly _tag: 'Project';
      readonly projectId: string;
      readonly page?: { readonly _tag: 'Session'; readonly sessionId: string };
    }
  | { readonly _tag: 'Settings' }
  | { readonly _tag: 'NotFound'; readonly path: string };
