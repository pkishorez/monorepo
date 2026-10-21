import { Schema } from 'effect';
import { Replica } from '@kestack/std-toolkit/replica';
import { Entry, Wallet } from '../../../apis/pocket/index.ts';

/*
 * The Pocket Replica's shapes: one Instance per Account, keyed by its user
 * id, holding that Account's wallets and entries as the Pocket Worker
 * stores them.
 */

export const Pocket = Replica.make('pocket', {
  key: Schema.String,
  collections: { wallets: Wallet, entries: Entry },
});
