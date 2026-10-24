import { Site } from '@kestack/web-platform/app/alchemy';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { CODE, where } from './stage.ts';
import { MachinesWorker } from './workers.ts';

/*
 * The site, as the Web Platform deploys a Kabuki Start app. How it signs
 * in and where the Machines Backend is are `VITE_*` env entries, which
 * Vite inlines into the browser's code, under `alchemy dev` and in a
 * deploy alike.
 */

/** An API Worker's URL: its host on this Stage, else whatever Alchemy gave it. */
const urlOf = (
  known: string | undefined,
  worker: { readonly url: Output.Output<string | undefined> },
) =>
  known ??
  Output.map(worker.url, (url) => {
    if (url === undefined) throw new Error('An API Worker has no URL');
    return url;
  });

export const Website = Site(CODE, () =>
  Effect.gen(function* () {
    const at = yield* where;
    const machines = yield* MachinesWorker;
    return {
      env: {
        ...('local' in at.auth
          ? { VITE_AUTH_LOCAL: 'true' }
          : { VITE_AUTH_URL: at.auth.url }),
        VITE_MACHINES_URL: urlOf(at.url('api'), machines),
      },
    };
  }),
);
