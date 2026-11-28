import { where as whereOn } from '@kestack/web-platform/app/alchemy';
import { Effect } from 'effect';

export const CONNECT = { host: 'connect', zone: 'kishore.app' } as const;

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
