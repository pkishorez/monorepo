import * as Cloudflare from 'alchemy/Cloudflare';
import { DurableRpcWorker } from 'rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker';
import { Effect } from 'effect';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeDurableObjectSQLite } from 'std-toolkit/db/sqlite/durable-object';
import { BankRpcs } from '../../demos/bank/rpc/contract/index.ts';
import { makeBankServer } from '../../demos/bank/server/index.ts';
import { bankTable } from '../../demos/bank/std-table/table/index.ts';
import { adminConnection, adminKey } from './config.ts';

export default class SqliteDO extends DurableRpcWorker<SqliteDO>()(
  'SqliteDO',
  {
    main: import.meta.filename,
    schema: BankRpcs,
    objectName: 'BankDurableObject',
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
    init: adminKey,
    connection: adminConnection,
  },
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    const table = SQLite.make(bankTable, {
      database: makeDurableObjectSQLite({ storage: state.raw.storage }),
    });
    yield* table.setup.pipe(Effect.orDie);
    return makeBankServer({ table: table.layer, checkpoint: true });
  }),
) {}
