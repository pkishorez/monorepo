import { DurableRpcWorker } from '@monorepo/alchemy-toolkit/unstable/durable-rpc-worker';
import { Effect } from 'effect';
import { BankRpcs } from '../../demos/bank/rpc/contract/index.ts';
import { makeBankServer } from '../../demos/bank/server/index.ts';
import { adminConnection, adminKey, dynamoSettings } from './config.ts';
import { dynamoClient } from './dynamo.ts';

export default class DynamoDO extends DurableRpcWorker<DynamoDO>()(
  'DynamoDO',
  {
    main: import.meta.filename,
    schema: BankRpcs,
    objectName: 'DynamoDurableObject',
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
    init: Effect.all([Effect.orDie(dynamoSettings), adminKey]),
    connection: adminConnection,
  },
  Effect.gen(function* () {
    const dynamo = yield* Effect.orDie(dynamoClient);
    return makeBankServer({ table: dynamo.layer, checkpoint: true });
  }),
) {}
