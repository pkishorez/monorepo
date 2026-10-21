import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

/*
 * Pocket's records, the same on the Worker and in the browser: an Account's
 * Wallets, and the Entries that move money in, out, or between them. Money
 * is whole cents. Each record carries the `userId` it belongs to, which the
 * Worker fills in from the caller and partitions the table by.
 */

/** One wallet of one Account; `balance` is the sum of its live Entries, in cents. */
export const Wallet = EntityESchema.make('Wallet', 'id', {
  userId: Schema.String,
  name: Schema.String,
  balance: Schema.Int,
}).build();

export type Wallet = typeof Wallet.Type;

const KINDS = ['deposit', 'withdrawal', 'transfer'] as const;

/**
 * One movement of money in one Wallet: `amount` is signed, positive in.
 * v1 had no `kind`; v2 names it, and links both sides of a transfer by
 * `transferId`. A v1 Entry reads as a deposit or a withdrawal by its sign,
 * since v1 could not tell a transfer apart.
 */
export const Entry = EntityESchema.make('Entry', 'id', {
  userId: Schema.String,
  walletId: Schema.String,
  amount: Schema.Int,
  note: Schema.String,
})
  .evolve(
    'v2',
    { kind: Schema.Literals(KINDS), transferId: Schema.NullOr(Schema.String) },
    (previous) => ({
      ...previous,
      kind:
        previous.amount < 0 ? ('withdrawal' as const) : ('deposit' as const),
      transferId: null,
    }),
  )
  .build();

export type Entry = typeof Entry.Type;

/** The ids of a transfer's two Entries, given the transfer's own id. */
export const transferEntryIds = (id: string) => ({
  from: `${id}.from`,
  to: `${id}.to`,
});
