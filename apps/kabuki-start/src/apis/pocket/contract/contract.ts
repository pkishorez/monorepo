import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz } from '@kestack/auth-toolkit';
import { Entry, Wallet } from '../domain/index.ts';

/*
 * What the Pocket Worker answers, shared by the Worker and the browser's
 * client. Every call is the signed-in caller's own: nothing names a User.
 *
 * Reads page through one kind of record in the order it last changed:
 * give the last Entity seen (null to start) and get up to a page of what
 * changed after it, ascending by `_u`, deletions included as tombstones.
 *
 * Writes take ids the client made, so a retried write finds what the first
 * one did instead of doing it twice, and answer every record they changed,
 * as stored, so the client can confirm them.
 */

/** How many records one read answers at most. */
export const PAGE = 100;

/** A withdrawal, a transfer or a deletion that would take a Wallet below zero. Nothing was written. */
export class Overdraft extends Schema.TaggedError<Overdraft>()('Overdraft', {
  walletId: Schema.String,
  balance: Schema.Int,
  amount: Schema.Int,
}) {}

/** A Wallet or an Entry the caller has none of. */
export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  kind: Schema.Literals(['wallet', 'entry']),
  id: Schema.String,
}) {}

/** A write that can never succeed as given, such as a transfer to the same Wallet. */
export class Invalid extends Schema.TaggedError<Invalid>()('Invalid', {
  reason: Schema.String,
}) {}

/** Every record one write changed, as stored. */
export const Changes = Schema.Struct({
  wallets: Schema.Array(Wallet.entity),
  entries: Schema.Array(Entry.entity),
});

const Id = Schema.NonEmptyString;
const Name = Schema.NonEmptyString;
const Cents = Schema.Int;
const WriteErrors = Schema.Union([Overdraft, NotFound, Invalid]);

export const PocketRpcs = Authz.required(
  RpcGroup.make(
    Rpc.make('Wallets', {
      payload: Schema.Struct({ '>': Schema.NullOr(Wallet.entity) }),
      success: Schema.Array(Wallet.entity),
    }),
    Rpc.make('Entries', {
      payload: Schema.Struct({ '>': Schema.NullOr(Entry.entity) }),
      success: Schema.Array(Entry.entity),
    }),
    Rpc.make('CreateWallet', {
      payload: Schema.Struct({ id: Id, name: Name }),
      success: Changes,
      error: WriteErrors,
    }),
    Rpc.make('RenameWallet', {
      payload: Schema.Struct({ id: Id, name: Name }),
      success: Changes,
      error: WriteErrors,
    }),
    Rpc.make('Post', {
      payload: Schema.Struct({
        id: Id,
        walletId: Id,
        amount: Cents,
        note: Schema.String,
      }),
      success: Changes,
      error: WriteErrors,
    }),
    Rpc.make('Transfer', {
      payload: Schema.Struct({
        id: Id,
        from: Id,
        to: Id,
        amount: Cents,
        note: Schema.String,
      }),
      success: Changes,
      error: WriteErrors,
    }),
    Rpc.make('DeleteEntry', {
      payload: Schema.Struct({ id: Id }),
      success: Changes,
      error: WriteErrors,
    }),
  ),
);
