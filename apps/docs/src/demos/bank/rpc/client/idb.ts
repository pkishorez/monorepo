import { Effect } from 'effect';
import { IDB } from 'std-toolkit/db/idb';
import { syncStore } from 'std-toolkit/sync';
import { webLockLeadership } from 'std-toolkit/sync/leadership/web-locks';
import { bankTable } from '../../std-table/table/index.ts';
import {
  loopback,
  runBank,
  type BankRuntime,
  type BankWiring,
} from './wiring.ts';

const idbWiring = Effect.gen(function* () {
  const table = IDB.make(bankTable, {
    database: IDB.database({ databaseName: 'bank-demo-v3' }),
  });
  const store = IDB.make(syncStore, {
    database: IDB.database({ databaseName: 'bank-demo-sync-v3' }),
  });
  yield* Effect.all([table.setup, store.setup]);
  return {
    ...loopback(table.layer),
    syncName: 'bank-idb-v3',
    storeLayer: store.layer,
    leadershipLayer: webLockLeadership(),
  } satisfies BankWiring;
});

let runtime: Promise<BankRuntime> | undefined;

export const idbBank = (): Promise<BankRuntime> =>
  (runtime ??= runBank(idbWiring));
