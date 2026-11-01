import { Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { AccountSchema, type Snapshot } from '../engine/index.js';

const Stored = ESchema.make('DeviceAccounts', {
  /** In the order they signed in, each with its one Sign-in token. */
  accounts: Schema.Array(
    Schema.Struct({ user: AccountSchema, token: Schema.String }),
  ),
  /** The Active Account's User id. */
  active: Schema.NullOr(Schema.String),
}).build();

export type Stored = typeof Stored.Type;

/** The Sign-in Store: where a Device keeps its Accounts and their Sign-in
 * tokens between runs. Realize it on a StdTable adapter (SQLite on a CLI,
 * secure storage on a phone) and pass the Layer as `storage`; in memory
 * unless given. */
export const deviceAccountsTable = StdTable.make('auth-device-accounts')
  .primary('pk', 'sk')
  .singleEntity(Stored, { default: { accounts: [], active: null } })
  .build();

export type SignInStorage = Layer.Layer<
  StdTableService<typeof deviceAccountsTable.logicalName>
>;

const stored = deviceAccountsTable.DeviceAccounts;

export const snapshotOf = ({ accounts, active }: Stored): Snapshot => ({
  active,
  accounts: accounts.map(({ user }) => user),
});

/** The stored Accounts, and changing them. A store that fails is a defect:
 * the Device cannot work without its own storage. */
export const makeSignInStore = Effect.gen(function* () {
  const table =
    yield* Effect.context<
      StdTableService<typeof deviceAccountsTable.logicalName>
    >();
  return {
    read: stored.get().pipe(
      Effect.map(({ value }) => value),
      Effect.provide(table),
      Effect.orDie,
    ),
    update: (change: (current: Stored) => Stored) =>
      stored.getAndUpdate(change).pipe(
        Effect.map(({ value }) => value),
        Effect.provide(table),
        Effect.orDie,
      ),
  };
});
