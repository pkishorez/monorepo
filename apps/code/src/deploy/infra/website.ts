import { Site } from '@kestack/web-platform/app/alchemy';
import { Effect } from 'effect';
import { CODE, where } from './stage.ts';

/*
 * The site, as the Web Platform deploys a Kabuki Start app. How it signs
 * in and where Cloud Connect is are `VITE_*` env entries, which Vite
 * inlines into the browser's code, under `alchemy dev` and in a deploy
 * alike.
 */

export const Website = Site(CODE, () =>
  Effect.gen(function* () {
    const at = yield* where;
    return {
      env: { VITE_AUTH_URL: at.auth.url, VITE_CONNECT_URL: at.connect },
    };
  }),
);
