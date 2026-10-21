import { eq } from '@tanstack/db';
import { Effect, Schema } from 'effect';
import { Query } from '@kestack/std-toolkit/replica';
import { Pocket } from '../../../../replicas/pocket/index.ts';

/*
 * What a Pocket view reads: an Account's wallets, and one wallet's
 * entries. Each holds the Account's Instance for as long as its Props name
 * it; Props naming another Account clear the rows before the new ones show.
 */

export const Wallets = Query.define('Wallets', {
  props: Schema.Struct({ account: Schema.String }),
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query:
    (_, { pocket }) =>
    (q) =>
      q.from({ wallet: pocket.wallets }),
});

export const Entries = Query.define('Entries', {
  props: Schema.Struct({ account: Schema.String, wallet: Schema.String }),
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query:
    ({ props }, { pocket }) =>
    (q) =>
      q
        .from({ entry: pocket.entries })
        .where(({ entry }) => eq(entry.walletId, props.wallet)),
});
