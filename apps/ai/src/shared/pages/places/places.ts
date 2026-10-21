/*
 * The Routes an actor moves the app to, made without the router: the
 * router is read from the pages, so a page that imported it would import
 * itself. `places.test.ts` checks each against the router's own.
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
