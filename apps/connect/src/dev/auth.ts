/*
 * How a dev run signs in, as the Web Platform decides for the site and
 * Cloud Connect: with auth-toolkit's Fake, as `dev@kestack.test`, unless
 * the run says `KESTACK_AUTH=real` (`pnpm dev:real`). The Connection is a Node
 * process, so it takes the Fake by Node's `--conditions`; a Fake Connection
 * keeps its own folders, `<branch>-fake`, apart from the real one's.
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

/** The branch whose folders and Connection a run signing in as `auth` uses. */
export const connectionBranch = (slug: string, auth: DevAuth): string =>
  auth === 'fake' ? `${slug.slice(0, 58)}-fake` : slug;

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
