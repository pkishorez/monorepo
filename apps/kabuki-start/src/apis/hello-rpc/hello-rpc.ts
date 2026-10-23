import { Context, Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import { HelloRpcs } from './contract.ts';

/*
 * The RPC Worker as the browser calls it: one Effect per level of access,
 * each the Worker's greeting or why it was refused. Its URL is the site's
 * `VITE_HELLO_RPC_URL`, which Alchemy sets and Vite inlines. Calls go with
 * the session cookie and the Account they expect, which auth-toolkit's
 * `browser` Layer adds; the Layer here requires it.
 */

const url = import.meta.env.VITE_HELLO_RPC_URL;

const make = Effect.map(RpcClient.make(HelloRpcs), (client) => ({
  public: client.Public(),
  authenticated: client.Authenticated(),
  authorized: client.Authorized(),
}));

export class HelloRpc extends Context.Service<
  HelloRpc,
  Effect.Success<typeof make>
>()('kabuki-start/HelloRpc') {
  /** Where the Worker is: what the client calls. */
  static readonly url = url;
  static readonly layer = Layer.effect(HelloRpc, make).pipe(
    Layer.provide(client(HelloRpcs, { url })),
  );
}
