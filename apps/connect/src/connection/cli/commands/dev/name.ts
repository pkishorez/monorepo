/*
 * The Connection a dev run of a branch serves, `dev-<branch>`, signed in
 * through the Auth Worker as any Connection is. The `dev-` keeps it clear
 * of `main`, the name `ke-connect serve` takes by default.
 */

/** What every development Connection's name starts with. */
export const DEV_PREFIX = 'dev-';

/** The Connection a run of the branch `slug` serves; 63 characters at most. */
export const connectionName = (slug: string): string =>
  `${DEV_PREFIX}${slug.slice(0, 59)}`;
