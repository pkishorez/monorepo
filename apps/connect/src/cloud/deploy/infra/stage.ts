import { where as whereOn } from '@kestack/web-platform/app/alchemy';
import { Effect } from 'effect';

/*
 * Where Cloud Connect is served on the Stage being run, as the Web
 * Platform says (`connect.kishore.app`, `pr12-connect.kishore.app`), the
 * Auth Worker it signs in through, and the origins whose pages may call
 * it. Under `alchemy dev` all three are on `.kishore.computer`, the
 * domain Portless serves; deployed, on `.kishore.app`.
 */

export const CONNECT = { host: 'connect', zone: 'kishore.app' } as const;

/** Where the Stage being run serves Cloud Connect, its Auth Worker, and the origins it lets call. */
export const where = Effect.gen(function* () {
  const at = yield* whereOn(CONNECT);
  return {
    ...at,
    authUrl: at.dev
      ? 'https://auth.kishore.computer'
      : 'https://auth.kishore.app',
    origins: at.dev ? 'https://*.kishore.computer' : 'https://*.kishore.app',
  };
});
