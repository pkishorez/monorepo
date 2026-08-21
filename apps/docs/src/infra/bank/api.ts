import {
  RpcWorker,
  withRateLimitGuard,
} from '@monorepo/alchemy-toolkit/unstable/rpc-worker';
import { Effect, Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { BankMutationsLive } from '../../demos/bank/rpc/mutations/index.ts';
import { BankSubscriptionsLive } from '../../demos/bank/rpc/subscriptions/dynamodb-worker/index.ts';
import {
  BankRpcSerializationLayer,
  BankRpcs,
} from '../../demos/bank/rpc/contract/index.ts';
import { dynamoClient } from './dynamo.ts';

export default class BankApi extends RpcWorker<BankApi>()(
  'BankApi',
  {
    main: import.meta.filename,
    workersDev: false,
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
    schema: BankRpcs,
  },
  Effect.gen(function* () {
    const dynamo = yield* dynamoClient;
    const bankHttp = yield* RpcServer.toHttpEffect(BankRpcs).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mergeAll(BankMutationsLive, BankSubscriptionsLive).pipe(
            Layer.provide(dynamo.layer),
          ),
          BankRpcSerializationLayer,
        ),
      ),
    );
    return yield* withRateLimitGuard(
      { name: 'BANK_RPC_LIMIT', namespaceId: 1001, limit: 120, period: 10 },
      bankHttp,
    );
  }),
) {}
