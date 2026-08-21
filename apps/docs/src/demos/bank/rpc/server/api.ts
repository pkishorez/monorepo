import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Redacted } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { RpcServer } from 'effect/unstable/rpc';
import { DynamoDB, type DynamoDBNativeError } from 'std-toolkit/db/dynamodb';
import { bankTable } from '../../std-table/table/index.ts';
import { BankHandlersLive } from '../handlers/index.ts';
import { BankRpcSerializationLayer, BankRpcs } from '../contract/index.ts';

const env = (key: string, fallback: string): string =>
  globalThis.process?.env?.[key] ?? fallback;

const endpoint = env('BANK_DYNAMODB_ENDPOINT', 'http://localhost:8090');
const isLocal = endpoint !== '';

const dynamo = DynamoDB.make(bankTable, {
  tableName: env('BANK_DYNAMODB_TABLE', 'std-bank-v3'),
  region: env('BANK_DYNAMODB_REGION', 'local'),
  credentials: {
    accessKeyId: env('AWS_ACCESS_KEY_ID', 'local'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY', 'local'),
  },
  ...(isLocal ? { endpoint } : {}),
});

const tableExists = (error: DynamoDBNativeError) => {
  try {
    return JSON.stringify(error.cause).includes('ResourceInUseException');
  } catch {
    return false;
  }
};

const tooManyRequests = () =>
  HttpServerResponse.text('Too many requests. Slow down and try again.', {
    status: 429,
    headers: { 'retry-after': '10' },
  });

/**
 * The bank RPC's own Worker — unaddressable (`workersDev: false`, no
 * routes), reached only through the docs Worker's `BANK_API` service
 * binding. Being its own Worker is what makes the throttle an Effect-native
 * `RateLimitClient` (a typed `RateLimitError` channel) instead of the
 * promise-shaped binding an async Worker's `env` would give it.
 *
 * `env` is deploy-time-only strings (AWS creds, table name) read straight
 * from `process.env` here, exactly as the promise-based handler used to —
 * no Alchemy resource (Stage, AWS DynamoDB.Table) is referenced from this
 * file, since props and impl both re-run inside the workerd bundle at
 * runtime, where no such deploy-only service is available. The DynamoDB
 * table itself is create-if-missing (`dynamo.setup` below), the same
 * idempotent path local dev already relied on — this demo doesn't need
 * Alchemy-managed table lifecycle (deletion protection, drift) on top.
 *
 * Declared through `Cloudflare.RpcWorker` (not a plain `Cloudflare.Worker`
 * hand-serving `RpcServer.toHttpEffect`) so `BankRpcs` is the Worker's
 * declared schema end-to-end — the same contract the docs Worker forwards
 * to over the service binding, and the browser's `RpcClient` speaks to
 * either this Worker or the in-browser loopback handlers without knowing
 * the difference.
 */
export default class BankApi extends Cloudflare.RpcWorker<BankApi>()(
  'BankApi',
  {
    main: import.meta.filename,
    workersDev: false,
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
    schema: BankRpcs,
    env: {
      BANK_DYNAMODB_TABLE: env('BANK_DYNAMODB_TABLE', 'std-bank-v3'),
      BANK_DYNAMODB_REGION: env('BANK_DYNAMODB_REGION', 'local'),
      BANK_DYNAMODB_ENDPOINT: endpoint,
      AWS_ACCESS_KEY_ID: Redacted.make(env('BANK_AWS_ACCESS_KEY_ID', 'local')),
      AWS_SECRET_ACCESS_KEY: Redacted.make(
        env('BANK_AWS_SECRET_ACCESS_KEY', 'local'),
      ),
    },
  },
  Effect.gen(function* () {
    const throttle = yield* Cloudflare.RateLimit('BANK_RPC_LIMIT', {
      namespaceId: 1001,
      simple: { limit: 120, period: 10 },
    });

    yield* dynamo.setup.pipe(
      Effect.catch((error) =>
        tableExists(error) ? Effect.void : Effect.die(error),
      ),
    );

    const services = Layer.mergeAll(
      BankHandlersLive.pipe(Layer.provide(dynamo.layer)),
      BankRpcSerializationLayer,
    );
    const bankHttp = yield* RpcServer.toHttpEffect(BankRpcs).pipe(
      Effect.provide(services),
    );

    return Effect.succeed(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const key = request.headers['cf-connecting-ip'] ?? 'unknown';
        const allowed = yield* throttle.limit({ key }).pipe(
          Effect.map((outcome) => outcome.success),
          Effect.catchTag('RateLimitError', () => Effect.succeed(true)),
        );
        if (!allowed) return tooManyRequests();
        return yield* bankHttp;
      }),
    );
  }).pipe(Effect.provide(Cloudflare.RateLimitBinding)),
) {}
