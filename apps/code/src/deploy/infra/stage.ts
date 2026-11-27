import { where as whereOn } from '@kestack/web-platform/app/alchemy';
import { Effect } from 'effect';

/*
 * Where Code is served on the Stage being run, as the Web Platform says
 * (`code.kishore.app`, `pr12-code.kishore.app`), how it signs in, and the
 * Connect Cloud it lists Connections from. Sign-in through the Auth Worker
 * works only where the site, Connect Cloud and the Auth Worker share a
 * cookie domain: `.kishore.computer` under `alchemy dev`, `.kishore.app` on
 * a deployed Stage. Every deployed Stage uses production Connect Cloud,
 * where the User's Connections are; under `alchemy dev`, `pnpm dev` hands the
 * branch's own in `CONNECT_URL`.
 */

export const CODE = { host: 'code', zone: 'kishore.app' } as const;

/** Connect Cloud under `alchemy dev`: the branch's, which `pnpm dev` sets. */
const connectDevUrl = () => {
  const url = process.env.CONNECT_URL;
  if (url === undefined || url === '') {
    throw new Error('CONNECT_URL is set by `pnpm dev`');
  }
  return url;
};

/** Where the Stage being run serves things, how it signs in, and its Connect Cloud. */
export const where = Effect.gen(function* () {
  const at = yield* whereOn(CODE);
  return {
    ...at,
    /** The Auth Worker at `url`. */
    auth: {
      url: at.dev
        ? 'https://auth.kishore.computer'
        : 'https://auth.kishore.app',
    },
    /** Connect Cloud's URL. */
    connect: at.dev ? connectDevUrl() : 'https://connect.kishore.app',
  };
});
