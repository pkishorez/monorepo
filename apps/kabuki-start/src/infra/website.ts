import { Site } from '@kestack/web-platform/app/alchemy';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { START, where } from './stage.ts';
import { HelloHttpWorker, HelloRpcWorker, PocketWorker } from './workers.ts';

/*
 * The site, as the Web Platform deploys a Kabuki Start app. Where the Auth
 * Worker and each API Worker are is a `VITE_*` env entry, which Vite
 * inlines into the browser's code, under `alchemy dev` and in a deploy
 * alike.
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

export const Website = Site(START, () =>
  Effect.gen(function* () {
    const at = yield* where;
    const http = yield* HelloHttpWorker;
    const rpc = yield* HelloRpcWorker;
    const pocket = yield* PocketWorker;
    return {
      env: {
        VITE_AUTH_URL: at.auth,
        VITE_HELLO_HTTP_URL: urlOf(at.url('hello-http'), http),
        VITE_HELLO_RPC_URL: urlOf(at.url('hello-rpc'), rpc),
        VITE_POCKET_URL: urlOf(at.url('pocket'), pocket),
      },
    };
  }),
);
