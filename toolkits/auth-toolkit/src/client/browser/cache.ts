import { Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { AccountSchema, type Snapshot } from '../accounts-layer/index.js';

const KnownAccounts = ESchema.make('BrowserAccounts', {
  active: Schema.NullOr(Schema.String),
  accounts: Schema.Array(AccountSchema),
}).build();

/** Where a Browser remembers its last-known Accounts, without tokens. Realize
 * it on a StdTable adapter (IDB keeps them across reloads) and pass the
 * Layer as `cache`. */
export const browserAccountsTable = StdTable.make('auth-browser-accounts')
  .primary('pk', 'sk')
  .build();

export type CacheStorage = Layer.Layer<
  StdTableService<typeof browserAccountsTable.logicalName>
>;

const known = browserAccountsTable
  .singleEntity(KnownAccounts)
  .default({ active: null, accounts: [] });

/** The last-known Snapshot, null when none was kept, and keeping a new one.
 * A cache that fails is a cache that missed. */
export const makeCache = Effect.gen(function* () {
  const table =
    yield* Effect.context<
      StdTableService<typeof browserAccountsTable.logicalName>
    >();
  return {
    last: known.get().pipe(
      Effect.map(({ value }): Snapshot | null =>
        value.accounts.length === 0 ? null : value,
      ),
      Effect.provide(table),
      Effect.orElseSucceed(() => null),
    ),
    keep: (snapshot: Snapshot) =>
      known.put(snapshot).pipe(Effect.provide(table), Effect.ignore),
  };
});
