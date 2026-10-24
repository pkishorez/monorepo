import { where as whereOn } from '@kestack/web-platform/app/alchemy';
import { Effect } from 'effect';

/*
 * Where Kabuki Start is served on the Stage being run, as the Web Platform
 * says (`start.kishore.app`, `pr12-hello-http-start.kishore.app`), and the
 * Auth Worker it signs in with. Sign-in works only where the site, the API
 * Workers and the Auth Worker share a cookie domain: `.kishore.computer`
 * under `alchemy dev`, `.kishore.app` on a deployed Stage. A personal
 * Stage deployed to `workers.dev` is served, but signs nobody in.
 */

export const START = { host: 'start', zone: 'kishore.app' } as const;

/**
 * An API Worker's URL under `alchemy dev`, aliased by `pnpm dev` without
 * the branch, so every worktree calls the same names.
 */
const apiDevUrl = (api: string) => `https://${api}-start.kishore.computer`;

/** Where the Stage being run serves things, and the Auth Worker it signs in with. */
export const where = Effect.gen(function* () {
  const at = yield* whereOn(START);
  return {
    ...at,
    url: (api?: string) =>
      at.dev && api !== undefined ? apiDevUrl(api) : at.url(api),
    auth: at.dev ? 'https://auth.kishore.computer' : 'https://auth.kishore.app',
  };
});
