import { Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { backend, portlessPort } from '@kestack/web-platform/app/alchemy';
import { D1 } from '@kestack/std-toolkit/alchemy';
import { connectionsTable } from '../src/server/index.ts';
import { catalog, minConnect, ReleaseFiles } from './catalog.ts';
import { where } from './stage.ts';

export const ConnectCloudDatabase = Cloudflare.D1.Database(
  'ConnectCloudDatabase',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `connect-cloud-${stage}` };
  }),
);

export const ConnectCloud = Cloudflare.Worker(
  'ConnectCloud',
  Effect.gen(function* () {
    const at = yield* where;
    const database = yield* ConnectCloudDatabase;
    const table = yield* D1.table('ConnectionsTable', {
      table: connectionsTable,
      database,
      mode: 'persistent',
    });
    const domain = at.domain();
    return {
      main: './src/worker.ts',
      ...backend(at),
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      ...(domain === undefined ? {} : { domain }),
      ...(at.dev ? { dev: { port: portlessPort(), strictPort: true } } : {}),
      env: {
        AUTH_URL: at.authUrl,
        ALLOWED_ORIGINS: at.origins,
        CATALOG: yield* catalog,
        MIN_CONNECT: yield* minConnect,
        DB: ConnectCloudDatabase,
        RELEASE_FILES: ReleaseFiles,
      },
      tag: Output.map(table.snapshot, () => 'connections'),
    };
  }),
);
