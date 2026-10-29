import { Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { AccountSchema, type Snapshot } from '../engine/index.js';

const KnownAccounts = ESchema.make('BrowserAccounts', {
  active: Schema.NullOr(Schema.String),
  accounts: Schema.Array(AccountSchema),
}).build();

/** Where a Browser remembers the Accounts last signed in, without tokens.
 * Realize it on a StdTable adapter (IDB keeps them across reloads) and pass
 * the Layer as `cache`. */
export const browserAccountsTable = StdTable.make('auth-browser-accounts')
  .primary('pk', 'sk')
  .singleEntity(KnownAccounts, { default: { active: null, accounts: [] } })
  .build();

export type CacheStorage = Layer.Layer<
  StdTableService<typeof browserAccountsTable.logicalName>
>;

const known = browserAccountsTable.BrowserAccounts;

/** The Snapshot last signed in, null when none is remembered, and keeping a
 * new one: one signed in, or one signed out to forget it (the engine says
 * which, see its `keep`). A cache that fails is a cache that missed, and
 * says so as a warning. */
export const makeCache = Effect.gen(function* () {
  const table =
    yield* Effect.context<
      StdTableService<typeof browserAccountsTable.logicalName>
    >();
  return {
    last: known.get().pipe(
      Effect.map(({ value }): Snapshot | null =>
        value.accounts.some(({ id }) => id === value.active) ? value : null,
      ),
      Effect.provide(table),
      Effect.catch((error) =>
        Effect.logWarning(
          'auth-toolkit: the Accounts last signed in could not be read',
          error,
        ).pipe(Effect.as(null)),
      ),
    ),
    keep: (snapshot: Snapshot) =>
      known.put(snapshot).pipe(
        Effect.provide(table),
        Effect.catch((error) =>
          Effect.logWarning(
            'auth-toolkit: the Accounts last signed in could not be kept',
            error,
          ),
        ),
      ),
  };
});
