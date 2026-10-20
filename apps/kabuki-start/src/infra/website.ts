import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { portlessPort, where } from './stage.ts';
import { HelloHttpWorker, HelloRpcWorker } from './workers.ts';

/**
 * The site: one Worker in front of the built assets. Start's Vite plugin
 * gives the Worker its entry, so there is no `main`. Where the Auth Worker
 * and each API Worker are is a `VITE_*` env entry, which Vite inlines into
 * the browser's code, under `alchemy dev` and in a deploy alike.
 */

/** An API Worker's URL: its host on this stage, else whatever Alchemy gave it. */
const urlOf = (
  known: string | undefined,
  worker: { readonly url: Output.Output<string | undefined> },
) =>
  known ??
  Output.map(worker.url, (url) => {
    if (url === undefined) throw new Error('An API Worker has no URL');
    return url;
  });

export const Website = Cloudflare.Website.Vite(
  'Site',
  Effect.gen(function* () {
    const at = yield* where;
    const http = yield* HelloHttpWorker;
    const rpc = yield* HelloRpcWorker;

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: at.dev ? { port: portlessPort() } : undefined,
      domain: at.domain(),
      env: {
        VITE_AUTH_URL: at.auth,
        VITE_HELLO_HTTP_URL: urlOf(at.url('hello-http'), http),
        VITE_HELLO_RPC_URL: urlOf(at.url('hello-rpc'), rpc),
      },
    };
  }),
);
