import { where as whereOn } from '@kestack/web-platform/app/alchemy';
import { Effect } from 'effect';

/*
 * Where Code is served on the Stage being run, as the Web Platform says
 * (`code.kishore.app`, `pr12-code.kishore.app`), and how it signs in.
 * Sign-in through the Auth Worker works only where the site, the Machines
 * Worker and the Auth Worker share a cookie domain: `.kishore.computer`
 * under `alchemy dev`, `.kishore.app` on a deployed Stage. Under
 * `alchemy dev` only, `AUTH=local` signs in by name with auth-toolkit's
 * Local mode instead, with no Auth Worker.
 */

export const CODE = { host: 'code', zone: 'kishore.app' } as const;

/** Whether `AUTH=local` asks for Local mode, which only `alchemy dev` may run. */
const localAuth = (dev: boolean): boolean => {
  if (process.env.AUTH !== 'local') return false;
  if (!dev) {
    throw new Error(
      'AUTH=local signs anyone in by name: it runs only under `alchemy dev` (`pnpm dev:local`), never deployed.',
    );
  }
  return true;
};

/**
 * The Machines Worker's URL under `alchemy dev`: the one `pnpm dev` asked
 * Portless for and aliased, `api-code.kishore`, with the branch in front
 * in a linked git worktree. ai-toolkit's `pnpm dev` asks Portless the
 * same, so a Machine finds this worktree's Backend.
 */
const machinesDevUrl = () => {
  const url = process.env.MACHINES_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'MACHINES_URL must be set by portless. Start the app with `pnpm dev`.',
    );
  }
  return url;
};

/** Where the Stage being run serves things, and how it signs in. */
export const where = Effect.gen(function* () {
  const at = yield* whereOn(CODE);
  return {
    ...at,
    url: (api?: string) =>
      at.dev && api !== undefined ? machinesDevUrl() : at.url(api),
    /** Local mode, or the Auth Worker at `url`. */
    auth: localAuth(at.dev)
      ? ({ local: true } as const)
      : {
          url: at.dev
            ? 'https://auth.kishore.computer'
            : 'https://auth.kishore.app',
        },
  };
});

/** The Machines Worker's port under `alchemy dev`, aliased by `pnpm dev` as `api-code.kishore` (with the branch in front in a worktree). */
export const MACHINES_DEV_PORT = 4591;
