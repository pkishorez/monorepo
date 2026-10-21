import { Context, Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import type { Entity } from '@kestack/std-toolkit/core';
import { PocketRpcs } from '../contract/index.ts';
import type { Entry, Wallet } from '../domain/index.ts';

/*
 * The Pocket Worker as the browser calls it. Every call names the Account
 * it is for, and goes out with `expect-user` naming that Account, whoever
 * is active when it is sent: a call meant for one Account that is still
 * going after a switch to another fails AccountChanged, instead of reading
 * or writing the other's records.
 *
 * auth-toolkit's `browser` Layer, which the Layer here requires, signs every
 * guarded call with the Account active at the moment, overwriting any
 * `expect-user` the call had. So the Account rides on the call under a
 * header of its own, and the transport puts it back into `expect-user`
 * after signing, as the last thing before the call leaves.
 *
 * The header is auth-toolkit's `expect-user`; its `expectUser` is not on
 * any of its public subpaths, so it is named here.
 *
 * The URL is the site's `VITE_POCKET_URL`, which Alchemy sets and Vite
 * inlines.
 */

const url = import.meta.env.VITE_POCKET_URL;

/** The header a call carries its Account in, from the caller to the transport. */
const ACCOUNT = 'pocket-account';

/** The header the Worker's Guard checks against the cookie's Active Account. */
const EXPECT_USER = 'expect-user';

/** `headers` with `expect-user` naming the Account they carry, if any. */
const pin = (
  headers: ReadonlyArray<readonly [string, string]>,
): Array<[string, string]> => {
  const account = headers.find(([name]) => name === ACCOUNT)?.[1];
  const kept = headers
    .filter(
      ([name]) =>
        account === undefined || (name !== ACCOUNT && name !== EXPECT_USER),
    )
    .map(([name, value]): [string, string] => [name, value]);
  return account === undefined ? kept : [...kept, [EXPECT_USER, account]];
};

/** `protocol` sending each call with `expect-user` naming the Account it carries. */
const pinned = (protocol: Layer.Layer<RpcClient.Protocol>) =>
  Layer.effect(
    RpcClient.Protocol,
    Effect.gen(function* () {
      const inner = yield* RpcClient.Protocol;
      return {
        ...inner,
        send: (clientId, request, transferables) =>
          inner.send(
            clientId,
            request._tag === 'Request'
              ? { ...request, headers: pin(request.headers) }
              : request,
            transferables,
          ),
      } satisfies RpcClient.Protocol['Service'];
    }),
  ).pipe(Layer.provide(protocol));

const make = Effect.map(RpcClient.make(PocketRpcs), (rpc) => {
  const as = (account: string) => ({ headers: { [ACCOUNT]: account } });
  return {
    /** Up to a page of `account`'s Wallets changed after `after`, oldest change first. */
    wallets: (account: string, after: Entity<Wallet> | null) =>
      rpc.Wallets({ '>': after }, as(account)),
    /** Up to a page of `account`'s Entries changed after `after`, oldest change first. */
    entries: (account: string, after: Entity<Entry> | null) =>
      rpc.Entries({ '>': after }, as(account)),
    createWallet: (
      account: string,
      input: Parameters<typeof rpc.CreateWallet>[0],
    ) => rpc.CreateWallet(input, as(account)),
    renameWallet: (
      account: string,
      input: Parameters<typeof rpc.RenameWallet>[0],
    ) => rpc.RenameWallet(input, as(account)),
    /** A deposit (positive `amount`) or a withdrawal (negative). */
    post: (account: string, input: Parameters<typeof rpc.Post>[0]) =>
      rpc.Post(input, as(account)),
    transfer: (account: string, input: Parameters<typeof rpc.Transfer>[0]) =>
      rpc.Transfer(input, as(account)),
    /** Deletes an Entry, both sides of a transfer. */
    deleteEntry: (
      account: string,
      input: Parameters<typeof rpc.DeleteEntry>[0],
    ) => rpc.DeleteEntry(input, as(account)),
  };
});

export class PocketRpc extends Context.Service<
  PocketRpc,
  Effect.Success<typeof make>
>()('kabuki-start/PocketRpc') {
  /** Where the Worker is: what the client calls. */
  static readonly url = url;
  static readonly layer = Layer.effect(PocketRpc, make).pipe(
    Layer.provide(pinned(client(PocketRpcs, { url }))),
  );
}
