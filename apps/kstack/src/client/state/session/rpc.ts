import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient } from 'effect/http';
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
 * `fetch`, signed as the Session's User whoever the browser's active User is,
 * and never by the cookie: a request with no token is not sent.
 */
const signedFetch = (credential: Credential): typeof fetch =>
  Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      if (credential.token === null) {
        return Promise.reject(
          new Error('[session] no token for this User yet'),
        );
      }
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${credential.token}`);
      return fetch(input, { ...init, headers, credentials: 'omit' });
    },
    { preconnect: fetch.preconnect },
  );

/** A runtime whose effects call the Ledger API at `/rpc` as one User. */
export const makeRpcRuntime = (credential: Credential) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({
          url: new URL('/rpc', window.location.origin).href,
        }).pipe(
          Layer.provide([
            FetchHttpClient.layer.pipe(
              Layer.provide(
                Layer.succeed(FetchHttpClient.Fetch, signedFetch(credential)),
              ),
            ),
            RpcSerialization.layerNdjson,
          ]),
        ),
      ),
    ),
  );

export type RpcRuntime = ReturnType<typeof makeRpcRuntime>;
