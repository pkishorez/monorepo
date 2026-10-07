import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/guard';
import type { AnyEntityESchema } from '@kstackz/std-toolkit/eschema';
import { Account, Category, Entry, Preferences } from '../model/index.ts';

/** Why the server could not read or write the user's money. */
export class LedgerError extends Schema.Error<LedgerError>(
  'kstack/LedgerError',
)({
  _tag: Schema.tag('LedgerError'),
  code: Schema.Literals(['not-found', 'storage-error']),
}) {}

/**
 * What the browser may ask of one kind of thing: every change after a
 * cursor (the `_u` of the newest change it has, or null for all), and
 * writing or deleting one. Writing a deleted one brings it back. A value
 * carries its own id; the server owns `userId`.
 */
const kind = <const N extends string, S extends AnyEntityESchema>(
  name: N,
  schema: S,
) =>
  RpcGroup.make(
    Rpc.make(`${name}.Changes`, {
      payload: { after: Schema.NullOr(Schema.String) },
      success: Schema.Array(schema.entity),
      error: LedgerError,
    }),
    Rpc.make(`${name}.Put`, {
      payload: { value: schema.schema },
      success: schema.entity,
      error: LedgerError,
    }),
    Rpc.make(`${name}.Delete`, {
      payload: { id: Schema.String },
      success: schema.entity,
      error: LedgerError,
    }),
  );

/** Everything the server does with the money, all for the signed-in user. */
export const LedgerApi = Authz.guard()(
  kind('Accounts', Account).merge(
    kind('Categories', Category),
    kind('Entries', Entry),
    kind('Preferences', Preferences),
    RpcGroup.make(
      // Writes the sample Accounts and Categories, and with `entries` three
      // Months of Entries, unless the user already has Accounts.
      Rpc.make('Ledger.Sample', {
        payload: { entries: Schema.Boolean },
        error: LedgerError,
      }),
      // Deletes every Account, Category and Entry of the user.
      Rpc.make('Ledger.Clear', { payload: {}, error: LedgerError }),
    ),
  ),
);
