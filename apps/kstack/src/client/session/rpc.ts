import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { LedgerApi } from '../../domain/ledger-api/index.ts';

const makeClient = RpcClient.make(LedgerApi);

/** The Ledger API, as the browser calls it. */
export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('kstack/Rpc') {}

/** A runtime whose effects can call the Ledger API at `/rpc`. */
export const makeRpcRuntime = () =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({
          url: new URL('/rpc', window.location.origin).href,
        }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
        ),
      ),
    ),
  );

export type RpcRuntime = ReturnType<typeof makeRpcRuntime>;
