import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer } from 'effect';
import { defaultBroadcaster } from 'std-toolkit/core';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeDurableObjectSQLite } from 'std-toolkit/db/sqlite/durable-object';
import { bankTable } from '../../../std-table/table/index.ts';
import { BankMutationsLive } from '../../mutations/index.ts';
import { BankSubscriptionsLive } from '../../subscriptions/durable-object/index.ts';

export const BankDurableObjectHandlers = Effect.gen(function* () {
  const state = yield* Cloudflare.DurableObjectState;

  const driver = makeDurableObjectSQLite({ storage: state.raw.storage });
  const table = SQLite.make(bankTable, { database: driver });
  yield* table.setup.pipe(Effect.orDie);

  return Layer.mergeAll(BankMutationsLive, BankSubscriptionsLive).pipe(
    Layer.provide(Layer.merge(table.layer, defaultBroadcaster)),
  );
});
