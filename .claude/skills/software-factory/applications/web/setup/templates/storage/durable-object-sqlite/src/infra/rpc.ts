import { Effect, Layer } from 'effect';
import * as Cloudflare from 'alchemy/Cloudflare';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeDurableObjectSQLite } from 'std-toolkit/db/sqlite/durable-object';
import { appTable } from '../shared/contracts/app-table/index.ts';
import { DurableRpcWorker } from 'rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker';
import { Greeting } from '../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../shared/rpc/greeting-handlers/index.ts';

export default class AppRpc extends DurableRpcWorker<AppRpc>()(
  'AppRpc',
  {
    main: import.meta.filename,
    schema: Greeting,
    objectName: 'AppRpcObject',
    compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
  },
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    const database = SQLite.make(appTable, {
      database: makeDurableObjectSQLite({ storage: state.raw.storage }),
    });

    yield* database.setup.pipe(Effect.orDie);

    return GreetingHandlers.pipe(Layer.provide(database.layer));
  }),
) {}
