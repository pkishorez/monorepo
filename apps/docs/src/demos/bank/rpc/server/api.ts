import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Redacted } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { RpcServer } from 'effect/unstable/rpc';
import { BankHandlersLive } from '../handlers/index.ts';
import { BankRpcSerializationLayer, BankRpcs } from '../contract/index.ts';
import {
  dynamo,
  dynamoEndpoint,
  dynamoRegion,
  dynamoTable,
} from './dynamo.ts';

const env = (key: string, fallback: string): string =>
  globalThis.process?.env?.[key] ?? fallback;

const tooManyRequests = () =>
  HttpServerResponse.text('Too many requests. Slow down and try again.', {
    status: 429,
    headers: { 'retry-after': '10' },
  });

export default class BankApi extends Cloudflare.RpcWorker<BankApi>()(
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
  Effect.gen(function* () {
    const throttle = yield* Cloudflare.RateLimit('BANK_RPC_LIMIT', {
      namespaceId: 1001,
      simple: { limit: 120, period: 10 },
    });

    const services = Layer.mergeAll(
      BankHandlersLive.pipe(Layer.provide(dynamo.layer)),
      BankRpcSerializationLayer,
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
        const bankHttp = yield* RpcServer.toHttpEffect(BankRpcs).pipe(
          Effect.provide(services),
        );
        return yield* bankHttp;
      }),
    );
  }).pipe(Effect.provide(Cloudflare.RateLimitBinding)),
) {}
