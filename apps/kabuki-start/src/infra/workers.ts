import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import { where } from './stage.ts';

/*
 * The API Workers, one per API, each a plain Worker whose `main` is its
 * entry under `src/apis`. Each is handed the Auth Worker to check sessions
 * with and the one origin it lets call with credentials, the site's.
 * Under `alchemy dev` each listens on a fixed port, which the `dev` script
 * names to Portless as `<api>-start.kishore.computer`, so the session
 * cookie for `.kishore.computer` reaches it.
 */

const api = <const Id extends string>(id: Id, name: string, port: number) =>
  Cloudflare.Worker(
    id,
    Effect.gen(function* () {
      const at = yield* where;
      return {
        main: `./src/apis/${name}/worker.server.ts`,
        compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
        domain: at.domain(name),
        dev: at.dev ? { port, strictPort: true } : undefined,
        env: { AUTH_URL: at.auth, SITE_ORIGIN: at.url() ?? '' },
      };
    }),
  );

export const HelloHttpWorker = api('HelloHttp', 'hello-http', 4581);
export const HelloRpcWorker = api('HelloRpc', 'hello-rpc', 4582);
