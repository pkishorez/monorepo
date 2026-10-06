import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { Authz } from '@kstackz/auth-toolkit/rpc';
import { RpcClient } from 'effect/rpc';
import { LedgerApi } from '../../../shared/ledger-api/index.ts';

const makeClient = RpcClient.make(LedgerApi);

/** The Ledger API, as the client calls it. */
export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('kstack/Rpc') {}

/**
 * Who a Session's calls are from: its User's session token, or null while
 * it is not yet known, as when the Session opened offline.
 */
export type Credential = { token: string | null };

/** How the client reaches a Backend's Ledger API: HTTP, or in-process. */
export type Connection = Layer.Layer<RpcClient.Protocol>;

/**
 * A runtime whose effects call the Ledger API over `connection` as one User,
 * signed with their token whoever the Active Session is: a call with no
 * token yet is not sent.
 */
export const makeRpcRuntime = (
  connection: Connection,
  credential: Credential,
) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide([connection, Authz.bearer(() => credential.token)]),
    ),
  );

export type RpcRuntime = ReturnType<typeof makeRpcRuntime>;
