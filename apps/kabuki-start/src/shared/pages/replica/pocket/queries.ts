import { inArray } from '@tanstack/db';
import { Effect, Schema } from 'effect';
import { Query } from '@kestack/std-toolkit/replica';
import { Pocket } from '../../../../replicas/pocket/index.ts';

/*
 * What a Pocket view reads: an Account's wallets, and the entries of the
 * wallets it watches. Each holds the Account's Instance for as long as its
 * Props name it; Props naming another Account clear the rows before the
 * new ones show. Entries filter on `walletId` with `inArray`, which opens
 * one Window per wallet watched: only those wallets' entries are fetched.
 * A wallet no longer watched lets go of its Window.
 */

const Shown = Schema.Struct({ account: Schema.String });

export const Wallets = Query.make('Wallets', {
  props: Shown,
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query:
    (_, { pocket }) =>
    (q) =>
      q.from({ wallet: pocket.wallets }),
});

export const Entries = Query.make('Entries', {
  props: Schema.Struct({
    account: Schema.String,
    /** The wallets watched, one Window each. */
    wallets: Schema.Array(Schema.String),
  }),
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query:
    ({ props }, { pocket }) =>
    (q) =>
      q
        .from({ entry: pocket.entries })
        .where(({ entry }) => inArray(entry.walletId, [...props.wallets])),
});
