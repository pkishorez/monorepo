import { AlchemyContext, Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { D1, providers as stdToolkitProviders } from 'std-toolkit/alchemy';
import { consoleTable } from './src/server/storage/table/index.ts';
// Entities register on the table as their modules load; the snapshot must see all of them.
import './src/server/storage/credentials/index.ts';
import './src/server/storage/stores/index.ts';

const productionHost: string = 'console.kishore.app';

export const Database = Cloudflare.D1.Database(
  'DatabaseV2',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `alchemy-console-v2-${stage}` };
  }),
);

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const { dev } = yield* AlchemyContext;
    const deployed = stage === 'prod' || /^pr[0-9]+$/.test(stage);
    if (deployed && process.env.CI !== 'true') {
      throw new Error('Deploy prod and PR stages through GitHub Actions.');
    }
    if (deployed && !productionHost) {
      throw new Error('Choose a production domain before deploying.');
    }
    const port = Number(process.env.PORT);
    if (dev && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Run pnpm dev so Portless can assign PORT.');
    }
    // The new database starts with one table and a fresh snapshot baseline.
    const database = yield* Database;
    const table = yield* D1.table('ConsoleTableV2', {
      table: consoleTable,
      database,
    });

    return {
      env: { DB: Database },
      // Keep Worker deployment behind the table resource.
      tag: Output.map(table.snapshot, () => 'console-v2'),
      compatibility: { date: '2026-07-01', flags: ['nodejs_compat'] },
      dev: dev ? { port } : undefined,
      domain: deployed
        ? stage === 'prod'
          ? productionHost
          : `${stage}-${productionHost}`
        : undefined,
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

export default Stack(
  'AlchemyConsole',
  {
    providers: Layer.merge(Cloudflare.providers(), stdToolkitProviders()),
    state: Cloudflare.state(),
  },
  Worker,
);
