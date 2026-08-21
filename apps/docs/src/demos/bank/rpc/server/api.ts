import {
  RpcWorker,
  withRateLimitGuard,
} from '@monorepo/alchemy-toolkit/unstable/rpc-worker';
import { Effect, Layer, Redacted } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { BankHandlersLive } from '../handlers/index.ts';
import { BankRpcSerializationLayer, BankRpcs } from '../contract/index.ts';
import { dynamo, dynamoEndpoint, dynamoRegion, dynamoTable } from './dynamo.ts';

const env = (key: string, fallback: string): string =>
  globalThis.process?.env?.[key] ?? fallback;

export class BankApi extends RpcWorker<BankApi>()(
  'BankApi',
  {
    main: import.meta.filename,
    workersDev: false,
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
    schema: BankRpcs,
    env: {
      BANK_DYNAMODB_TABLE: dynamoTable,
      BANK_DYNAMODB_REGION: dynamoRegion,
      BANK_DYNAMODB_ENDPOINT: dynamoEndpoint,
      AWS_ACCESS_KEY_ID: Redacted.make(env('BANK_AWS_ACCESS_KEY_ID', 'local')),
      AWS_SECRET_ACCESS_KEY: Redacted.make(
        env('BANK_AWS_SECRET_ACCESS_KEY', 'local'),
      ),
    },
  },
  withRateLimitGuard(
    { name: 'BANK_RPC_LIMIT', namespaceId: 1001, limit: 120, period: 10 },
    Effect.gen(function* () {
      const bankHttp = yield* RpcServer.toHttpEffect(BankRpcs).pipe(
        Effect.provide(
          Layer.mergeAll(
            BankHandlersLive.pipe(Layer.provide(dynamo.layer)),
            BankRpcSerializationLayer,
          ),
        ),
      );
      return yield* bankHttp;
    }),
  ),
) {}
