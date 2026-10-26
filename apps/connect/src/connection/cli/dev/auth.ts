/*
 * How a dev run signs in, as the Web Platform decides for the site and
 * Cloud Connect: with auth-toolkit's Fake, as `dev@kestack.test`, unless
 * the run says `KESTACK_AUTH=real` (`pnpm dev:real`). The Connection is a Node
 * process, so it takes the Fake by Node's `--conditions`. The branch's
 * Connection is named for it, `dev-<branch>`, signed in as the Fake's test
 * user; one signed in for real is `dev-<branch>-real`, apart from it. The
 * `dev-` keeps them clear of `main`, the name `ke-connect serve` takes by
 * default.
 */

export type DevAuth = 'fake' | 'real';

// auth-toolkit's export condition for its Fake.
const FAKE_AUTH = 'kestack-fake-auth';

/** How this run signs in. */
export const devAuth = (): DevAuth =>
  process.env['KESTACK_AUTH'] === 'real' ? 'real' : 'fake';

/** Node's flags for a process that signs in as `auth` says. */
export const nodeFlags = (auth: DevAuth): ReadonlyArray<string> =>
  auth === 'fake' ? [`--conditions=${FAKE_AUTH}`] : [];

/** What every development Connection's name starts with. */
export const DEV_PREFIX = 'dev-';

/** The Connection a run of the branch `slug` signing in as `auth` serves; 63 characters at most. */
export const connectionName = (slug: string, auth: DevAuth): string =>
  auth === 'fake'
    ? `${DEV_PREFIX}${slug.slice(0, 59)}`
    : `${DEV_PREFIX}${slug.slice(0, 54)}-real`;

/** How the development Connection `name` signs in, as its name says. */
export const authOf = (name: string): DevAuth =>
  name.endsWith('-real') ? 'real' : 'fake';

/** Throws unless this process resolves auth-toolkit's doors as `auth` says. */
export const assertResolves = (auth: DevAuth): void => {
  const fake = import.meta
    .resolve('@kestack/auth-toolkit/client/device')
    .includes('/fake/');
  if (fake !== (auth === 'fake'))
    throw new Error(
      auth === 'fake'
        ? `Connect signs in with the Fake, but Node was not started with ${nodeFlags(auth).join(' ')}; run \`pnpm dev\`.`
        : 'KESTACK_AUTH=real, but Node resolves the Fake; run `pnpm dev:real`.',
    );
};
