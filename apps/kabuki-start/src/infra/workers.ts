import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { D1 } from '@kestack/std-toolkit/alchemy';
import { pocketTable } from '../apis/pocket/storage/index.ts';
import { where } from './stage.ts';

/*
 * The API Workers, one per API, each a plain Worker whose `main` is its
 * entry under `src/apis`. Each is handed the Auth Worker to check sessions
 * with and the one origin it lets call with credentials, the site's.
 * Under `alchemy dev` each listens on a fixed port, which the `dev` script
 * names to Portless as `<api>-start.kishore.computer`, so the session
 * cookie for `.kishore.computer` reaches it.
 *
 * The Pocket Worker keeps its records in a D1 database of its own, in the
 * `pocket` std Table. The table goes through std-toolkit's snapshot guard,
 * which refuses a deploy whose table would no longer read the rows already
 * stored, and the Worker is deployed only behind it.
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

export const PocketDatabase = Cloudflare.D1.Database(
  'PocketDatabase',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `kabuki-start-pocket-${stage}` };
  }),
);

export const PocketWorker = Cloudflare.Worker(
  'Pocket',
  Effect.gen(function* () {
    const at = yield* where;
    const database = yield* PocketDatabase;
    const table = yield* D1.table('PocketTable', {
      table: pocketTable,
      database,
    });
    return {
      main: './src/apis/pocket/worker.server.ts',
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      domain: at.domain('pocket'),
      dev: at.dev ? { port: 4583, strictPort: true } : undefined,
      env: {
        AUTH_URL: at.auth,
        SITE_ORIGIN: at.url() ?? '',
        DB: PocketDatabase,
      },
      // Keep the Worker's deployment behind the table and its guard.
      tag: Output.map(table.snapshot, () => 'pocket'),
    };
  }),
);
