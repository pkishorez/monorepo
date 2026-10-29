import { Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { backend, portlessPort } from '@kestack/web-platform/app/alchemy';
import { D1 } from '@kestack/std-toolkit/alchemy';
import { connectionsTable } from '../src/cloud/worker/index.ts';
import { minConnect, PluginFiles, plugins } from './plugins/index.ts';
import { where } from './stage.ts';

/*
 * Cloud Connect's Worker, served at `connect.kishore.app` (Portless's
 * `connect.kishore.computer` under `alchemy dev`, with the branch in front
 * in a linked worktree), with a D1 database of its own holding the
 * `connections` std Table. std-toolkit sets the table up at deploy against
 * the Stored contract inside it, refusing a deploy whose table would no
 * longer read the rows already stored and running any Backfill, and the
 * Worker is deployed only behind it. Under `pnpm
 * dev` it signs in with auth-toolkit's Fake, as the Web Platform's
 * `backend` bundles it.
 *
 * It tells every Connection what plugins/ says: the latest Release of each
 * Plugin in `PLUGINS`, its file on the Shelf, and the Minimum Connect in
 * `MIN_CONNECT`. It serves the R2 Shelf, `PLUGIN_FILES`.
 */

export const CloudConnectDatabase = Cloudflare.D1.Database(
  'CloudConnectDatabase',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `cloud-connect-${stage}` };
  }),
);

export const CloudConnect = Cloudflare.Worker(
  'CloudConnect',
  Effect.gen(function* () {
    const at = yield* where;
    const database = yield* CloudConnectDatabase;
    const table = yield* D1.table('ConnectionsTable', {
      table: connectionsTable,
      database,
      mode: 'persistent',
    });
    const domain = at.domain();
    return {
      main: './src/cloud/worker/worker.server.ts',
      ...backend(at),
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      ...(domain === undefined ? {} : { domain }),
      ...(at.dev ? { dev: { port: portlessPort(), strictPort: true } } : {}),
      env: {
        AUTH_URL: at.authUrl,
        ALLOWED_ORIGINS: at.origins,
        // The Plugins every Connection runs, `{"code":{"hash","url"}}`.
        PLUGINS: yield* plugins,
        MIN_CONNECT: yield* minConnect,
        DB: CloudConnectDatabase,
        PLUGIN_FILES: PluginFiles,
      },
      // Keep the Worker's deployment behind the table and its guard.
      tag: Output.map(table.snapshot, () => 'connections'),
    };
  }),
);
