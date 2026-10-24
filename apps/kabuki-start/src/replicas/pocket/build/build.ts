import { Effect, Schema, Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import { oldToNew, Replica } from '@kestack/std-toolkit/replica';
import { CurrentAccount } from '@kestack/web-platform/recipes/account-switcher';
import { Entry, PocketRpc, Wallet } from '../../../apis/pocket/index.ts';
import { Pocket } from '../shape/index.ts';

/*
 * How each Pocket Instance syncs: every wallet, and the entries of only the
 * wallets a Query filters on, one Window per wallet. Each reads from the
 * Pocket Worker oldest change first, polled every 2 seconds, every call
 * made for the Instance's own Account. Its Gate is open only while that
 * Account is the active one: the cookie is the active Account's, so any
 * other Instance stays readable from the device, and fetches nothing. An
 * Instance, or a Window, nothing uses runs on for 8 seconds, so another
 * page reading it meanwhile finds it running, and the page can show it
 * counting down.
 */

/** Reads one Collection forward for an Account, with entities in encoded form both ways. */
const reading = <S extends typeof Wallet | typeof Entry>(
  schema: S,
  read: (
    rpc: PocketRpc['Service'],
    account: string,
    after: Entity<S['Type']> | null,
  ) => Effect.Effect<ReadonlyArray<Entity<S['Type']>>, unknown>,
) => {
  const decode = Schema.decodeUnknownEffect(schema.entity);
  const encode = Schema.encodeEffect(schema.entity);
  return oldToNew({
    fetch: ({ key, after }: { key: string; after: Entity<unknown> | null }) =>
      Effect.gen(function* () {
        const rpc = yield* PocketRpc;
        const cursor =
          after === null ? null : ((yield* decode(after)) as Entity<S['Type']>);
        const page = yield* read(rpc, key, cursor);
        return yield* Effect.forEach(page, (entity) =>
          encode(entity as never),
        ) as Effect.Effect<ReadonlyArray<Entity<unknown>>, unknown>;
      }),
    pollEvery: '2 seconds',
  });
};

export const PocketLive = Replica.build(Pocket, {
  gcTime: '8 seconds',
  gate: ({ key }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const { state } = yield* CurrentAccount;
        return Stream.map(
          state,
          ({ account }) =>
            account._tag === 'SignedIn' && account.active.id === key,
        );
      }),
    ),
  collections: {
    wallets: {
      strategy: reading(Wallet, (rpc, account, after) =>
        rpc.wallets(account, after),
      ),
    },
    entries: {
      windows: {
        walletId: (walletId) =>
          reading(Entry, (rpc, account, after) =>
            rpc.walletEntries(account, walletId, after),
          ),
      },
    },
  },
});
