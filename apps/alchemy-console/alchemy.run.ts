import { Action, AlchemyContext, Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { SQLite } from 'std-toolkit/db/sqlite';
import type { TableSnapshot } from 'std-toolkit/snapshot';
import { makeD1SQLite } from 'std-toolkit/db/sqlite/d1';
import { consoleTable } from './src/server/storage/table/index.ts';
// Entities register on the table as their modules load; the snapshot must see all of them.
import './src/server/storage/credentials/index.ts';
import './src/server/storage/stores/index.ts';

const productionHost: string = 'alchemy.kishore.app';

export const Database = Cloudflare.D1.Database(
  'Database',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `alchemy-console-${stage}` };
  }),
);

// Runs whenever the console table's schema changes.
const PrepareDatabase = Action(
  'PrepareDatabase',
  Effect.gen(function* () {
    const query = yield* Cloudflare.D1.QueryDatabase(Database);
    return Effect.fn(function* (_schema: { snapshot: TableSnapshot }) {
      const database = makeD1SQLite({ database: yield* query.raw });
      const table = SQLite.make(consoleTable, { database });
      yield* table.setup;
      yield* consoleTable.verifySnapshot().pipe(Effect.provide(table.layer));
    });
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseLocal)),
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
    yield* PrepareDatabase({ snapshot: consoleTable.snapshot() });

    return {
      env: { DB: Database },
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
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Worker,
);
