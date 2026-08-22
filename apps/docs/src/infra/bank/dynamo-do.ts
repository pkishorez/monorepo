import { DurableRpcWorker } from '@monorepo/alchemy-toolkit/unstable/durable-rpc-worker';
import { Effect, Layer } from 'effect';
import { defaultBroadcaster } from 'std-toolkit/core';
import { BankRpcs } from '../../demos/bank/rpc/contract/index.ts';
import { BankMutationsLive } from '../../demos/bank/rpc/mutations/index.ts';
import { BankSubscriptionsLive } from '../../demos/bank/rpc/subscriptions/durable-object/index.ts';
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
    return Layer.mergeAll(BankMutationsLive, BankSubscriptionsLive).pipe(
      Layer.provide(Layer.merge(dynamo.layer, defaultBroadcaster)),
    );
  }),
) {}
