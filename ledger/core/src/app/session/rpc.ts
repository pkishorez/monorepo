import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { Authz } from '@kstackz/auth-toolkit/rpc';
import { RpcClient } from 'effect/rpc';
import { LedgerApi } from '../../api/index.ts';
import type { BackendLink } from '../link/index.ts';

const makeClient = RpcClient.make(LedgerApi);

/** The Ledger API, as the client calls it. */
export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('kstack/Rpc') {}

/**
 * Who a Session's calls are from: its User's session token at each call,
 * waited for while it is not yet known, as when the Session opened before
 * the Backend answered.
 */
export type Credential = Effect.Effect<string>;

/**
 * A runtime whose effects call the Ledger API over `api` as one User,
 * signed with their token whoever the Active Session is: a call with no
 * token yet waits for one.
 */
export const makeRpcRuntime = (
  api: BackendLink['Service']['api'],
  credential: Credential,
) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide([api, Authz.bearer(credential)]),
    ),
  );

export type RpcRuntime = ReturnType<typeof makeRpcRuntime>;
