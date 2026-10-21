import { createContext } from 'react';

/*
 * What a Pocket's Queries draw with, handed down from the Pocket View: the
 * one-click writes, null while the Pocket is read-only, the refusal kept
 * beside each spot, the wallets' names for the activity list, and which
 * wallets are watched, so their entries sync.
 */

export interface Writes {
  readonly addWallet: (name: string) => void;
  readonly change: (wallet: string, cents: number) => void;
  readonly move: (from: string, to: string, cents: number) => void;
  readonly remove: (entry: string) => void;
  /** A $1 deposit made at the Worker, as another device would. */
  readonly elsewhere: (wallet: string) => void;
}

export interface Ledger {
  readonly writes: Writes | null;
  /** The refusal beside a wallet's id, `new`, or `activity`; null if none. */
  readonly refusedAt: (at: string) => string | null;
  readonly nameOf: (wallet: string) => string;
  /** The wallets whose entries sync: one Window each. */
  readonly watching: ReadonlyArray<string>;
  readonly watch: (wallet: string) => void;
}

export const LedgerContext = createContext<Ledger>({
  writes: null,
  refusedAt: () => null,
  nameOf: () => 'a wallet',
  watching: [],
  watch: () => {},
});

/** An id that sorts by when it was made, so new rows sort last. */
export const newId = () =>
  `${Date.now().toString(36).padStart(9, '0')}${Math.random().toString(36).slice(2, 8)}`;

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Cents as dollars: `$10.00`. */
export const money = (cents: number) => dollars.format(cents / 100);

/** Cents as dollars with a sign: `+$10.00`, `−$5.00`. */
export const signed = (cents: number) =>
  `${cents < 0 ? '−' : '+'}${money(Math.abs(cents))}`;
