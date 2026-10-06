import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { signedFetchLayer } from '@kstackz/auth-toolkit/clients/accounts';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { LedgerApi } from '../../../domain/ledger-api/index.ts';

const makeClient = RpcClient.make(LedgerApi);

/** The Ledger API, as the browser calls it. */
export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('kstack/Rpc') {}

/**
 * Who a Session's requests are from: its User's session token, or null
 * while it is not yet known, as when the Session opened offline.
 */
export type Credential = { token: string | null };

/**
 * A runtime whose effects call the Ledger API at `/rpc` as one User, signed
 * with their token whoever the browser's active User is, and never by the
 * cookie: a request with no token yet is not sent.
 */
export const makeRpcRuntime = (credential: Credential) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({
          url: new URL('/rpc', window.location.origin).href,
        }).pipe(
          Layer.provide([
            signedFetchLayer(() => credential.token),
            RpcSerialization.layerNdjson,
          ]),
        ),
      ),
    ),
  );

export type RpcRuntime = ReturnType<typeof makeRpcRuntime>;
