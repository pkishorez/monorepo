import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { D1 } from '@kstackz/std-toolkit/alchemy';
import { ledgerTable } from '@ledger/core/backend/services/table';
import {
  assertStageIsSafe,
  devConfigFor,
  domainFor,
  isDeployedStage,
} from './stage.ts';

/** The D1 database holding every user's money, one per stage. */
export const Database = Cloudflare.D1.Database(
  'Database',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `kstack-${stage}` };
  }),
);

export const Website = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);
    // The table refuses a deploy its stored rows could not be read after.
    const table = yield* D1.table('LedgerTable', {
      table: ledgerTable,
      database: yield* Database,
    });

    return {
      env: {
        // The shared store, in the polling Sync Mode.
        DB: Database,
        // Each User's own store, in the realtime one: the Worker exports the
        // class, `LedgerObject`.
        LedgerObject: Cloudflare.DurableObject('LedgerObject'),
      },
      // The Worker deploys after the table it reads.
      tag: Output.map(table.snapshot, () => 'ledger'),
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: devConfigFor(!isDeployedStage(stage)),
      domain: domainFor(stage),
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Website>;
