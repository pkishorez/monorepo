import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { Account, Category, Entry, Preferences } from '../model/index.ts';

/** Why the server could not read or write the user's money. */
export class LedgerError extends Schema.Error<LedgerError>(
  'kstack/LedgerError',
)({
  _tag: Schema.tag('LedgerError'),
  code: Schema.Literals(['not-found', 'storage-error']),
}) {}

// A cursor: the `_u` of a change, or null for the very start (or end).
const Cursor = Schema.NullOr(Schema.String);

// Every kind is read the same three ways: each change after a cursor, a
// page older than one (newest first), and every change after a cursor and
// then each as it is made. A value carries its own id; the server owns
// `userId`. Writing a deleted value brings it back.

export const AccountRpcs = RpcGroup.make(
  Rpc.make('AccountChanges', {
    payload: { after: Cursor },
    success: Schema.Array(Account.entity),
    error: LedgerError,
  }),
  Rpc.make('AccountOlder', {
    payload: { before: Cursor },
    success: Schema.Array(Account.entity),
    error: LedgerError,
  }),
  Rpc.make('AccountWatch', {
    payload: { after: Cursor },
    success: Schema.Array(Account.entity),
    error: LedgerError,
    stream: true,
  }),
  Rpc.make('AccountPut', {
    payload: { value: Account.schema },
    success: Account.entity,
    error: LedgerError,
  }),
  Rpc.make('AccountDelete', {
    payload: { id: Schema.String },
    success: Account.entity,
    error: LedgerError,
  }),
);

export const CategoryRpcs = RpcGroup.make(
  Rpc.make('CategoryChanges', {
    payload: { after: Cursor },
    success: Schema.Array(Category.entity),
    error: LedgerError,
  }),
  Rpc.make('CategoryOlder', {
    payload: { before: Cursor },
    success: Schema.Array(Category.entity),
    error: LedgerError,
  }),
  Rpc.make('CategoryWatch', {
    payload: { after: Cursor },
    success: Schema.Array(Category.entity),
    error: LedgerError,
    stream: true,
  }),
  Rpc.make('CategoryPut', {
    payload: { value: Category.schema },
    success: Category.entity,
    error: LedgerError,
  }),
  Rpc.make('CategoryDelete', {
    payload: { id: Schema.String },
    success: Category.entity,
    error: LedgerError,
  }),
);

export const EntryRpcs = RpcGroup.make(
  Rpc.make('EntryChanges', {
    payload: { after: Cursor },
    success: Schema.Array(Entry.entity),
    error: LedgerError,
  }),
  Rpc.make('EntryOlder', {
    payload: { before: Cursor },
    success: Schema.Array(Entry.entity),
    error: LedgerError,
  }),
  Rpc.make('EntryWatch', {
    payload: { after: Cursor },
    success: Schema.Array(Entry.entity),
    error: LedgerError,
    stream: true,
  }),
  Rpc.make('EntryPut', {
    payload: { value: Entry.schema },
    success: Entry.entity,
    error: LedgerError,
  }),
  Rpc.make('EntryDelete', {
    payload: { id: Schema.String },
    success: Entry.entity,
    error: LedgerError,
  }),
);

/** The user's own Preferences: one value, written whole, never deleted. */
export const PreferencesRpcs = RpcGroup.make(
  Rpc.make('PreferencesChanges', {
    payload: { after: Cursor },
    success: Schema.Array(Preferences.entity),
    error: LedgerError,
  }),
  Rpc.make('PreferencesOlder', {
    payload: { before: Cursor },
    success: Schema.Array(Preferences.entity),
    error: LedgerError,
  }),
  Rpc.make('PreferencesWatch', {
    payload: { after: Cursor },
    success: Schema.Array(Preferences.entity),
    error: LedgerError,
    stream: true,
  }),
  Rpc.make('PreferencesPut', {
    payload: { value: Preferences.schema },
    success: Preferences.entity,
    error: LedgerError,
  }),
);

export const LedgerRpcs = RpcGroup.make(
  // Writes the sample Accounts and Categories, and with `entries` three
  // Months of Entries, unless the user already has Accounts.
  Rpc.make('LedgerSample', {
    payload: { entries: Schema.Boolean },
    error: LedgerError,
  }),
  // Deletes every Account, Category and Entry of the user.
  Rpc.make('LedgerClear', { payload: {}, error: LedgerError }),
);

/** Everything the server does with the money, all for the signed-in user. */
export const LedgerApi = Authz.guard()(
  AccountRpcs.merge(CategoryRpcs, EntryRpcs, PreferencesRpcs, LedgerRpcs),
);
