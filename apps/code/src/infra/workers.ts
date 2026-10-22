import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { machinesTable } from '@kestack/ai-toolkit/machines/backend';
import { D1 } from '@kestack/std-toolkit/alchemy';
import { MACHINES_DEV_PORT, where } from './stage.ts';

/*
 * The Machines Worker: the Machines Backend from
 * `@kestack/ai-toolkit/machines/backend`, served at `api-code.kishore.app`
 * (`api-code.kishore.computer` under `alchemy dev`). It is handed how the
 * stage signs in (`AUTH_URL`, or `AUTH_LOCAL=true` in Local mode), the one
 * origin it lets call with credentials, the site's, and a D1 database of
 * its own holding the `machines` std Table. The table goes through
 * std-toolkit's snapshot guard, which refuses a deploy whose table would no
 * longer read the rows already stored, and the Worker is deployed only
 * behind it.
 */

export const MachinesDatabase = Cloudflare.D1.Database(
  'MachinesDatabase',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `code-machines-${stage}` };
  }),
);

export const MachinesWorker = Cloudflare.Worker(
  'Machines',
  Effect.gen(function* () {
    const at = yield* where;
    const database = yield* MachinesDatabase;
    const table = yield* D1.table('MachinesTable', {
      table: machinesTable,
      database,
    });
    return {
      main: './src/apis/machines/worker.server.ts',
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      domain: at.domain('api'),
      dev: at.dev ? { port: MACHINES_DEV_PORT, strictPort: true } : undefined,
      env: {
        ...('local' in at.auth
          ? { AUTH_LOCAL: 'true' }
          : { AUTH_URL: at.auth.url }),
        SITE_ORIGIN: at.url() ?? '',
        DB: MachinesDatabase,
      },
      // Keep the Worker's deployment behind the table and its guard.
      tag: Output.map(table.snapshot, () => 'machines'),
    };
  }),
);
