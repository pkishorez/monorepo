import { Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { portlessPort } from '@kestack/web-platform/app/alchemy';
import { D1 } from '@kestack/std-toolkit/alchemy';
import { machinesTable } from '../src/cloud/worker/index.ts';
import { where } from './stage.ts';

/*
 * Cloud Connect's Worker, served at `connect.kishore.app` (Portless's
 * `connect.kishore.computer` under `alchemy dev`, with the branch in front
 * in a linked worktree), with a D1 database of its own holding the
 * `machines` std Table. The table goes through std-toolkit's deploy guard,
 * which refuses a deploy whose table would no longer read the rows
 * already stored, and the Worker is deployed only behind it.
 */

export const CloudConnectDatabase = Cloudflare.D1.Database(
  'CloudConnectDatabase',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `connect-${stage}` };
  }),
);

export const CloudConnect = Cloudflare.Worker(
  'CloudConnect',
  Effect.gen(function* () {
    const at = yield* where;
    const database = yield* CloudConnectDatabase;
    const table = yield* D1.table('MachinesTable', {
      table: machinesTable,
      database,
      mode: 'persistent',
    });
    const domain = at.domain();
    return {
      main: './src/cloud/worker/worker.server.ts',
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      ...(domain === undefined ? {} : { domain }),
      ...(at.dev ? { dev: { port: portlessPort(), strictPort: true } } : {}),
      env: {
        AUTH_URL: at.authUrl,
        ALLOWED_ORIGINS: at.origins,
        DB: CloudConnectDatabase,
      },
      // Keep the Worker's deployment behind the table and its guard.
      tag: Output.map(table.snapshot, () => 'machines'),
    };
  }),
);
