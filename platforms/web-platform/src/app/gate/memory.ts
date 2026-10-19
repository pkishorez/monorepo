import { Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { Backend } from '../host/index.ts';

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
});

// v1, as devices still keep it: the Remembered Accounts of each Backend,
// the Local Backend under its former name, `device`.
const RememberedV1 = Schema.Struct({
  accounts: Schema.Array(Schema.Struct({ user: User, active: Schema.Boolean })),
  lost: Schema.NullOr(User),
});

/** The account found lost on one Backend, until the User signs in to it
 * again or someone new signs in; `seen` are the accounts signed in when it
 * was found, so someone new is told apart. */
const Lost = Schema.NullOr(
  Schema.Struct({ account: User, seen: Schema.Array(Schema.String) }),
);

const GateMemory = ESchema.make('GateMemory', {
  backend: Schema.NullOr(Schema.Literals(['cloud', 'device'])),
  cloud: RememberedV1,
  device: RememberedV1,
})
  // The Remembered Accounts moved to auth-toolkit's Accounts, so only the
  // account lost is kept; and the device Backend became the Local Backend:
  // a stored `device` is read as `local`.
  .evolve(
    'v2',
    {
      backend: Schema.NullOr(Backend),
      cloud: Lost,
      local: Lost,
      device: null,
    },
    (v1) => {
      const lostOf = (remembered: typeof RememberedV1.Type) =>
        remembered.lost === null
          ? null
          : {
              account: remembered.lost,
              seen: remembered.accounts.map(({ user }) => user.id),
            };
      return {
        backend: v1.backend === 'device' ? 'local' : v1.backend,
        cloud: lostOf(v1.cloud),
        local: lostOf(v1.device),
      };
    },
  )
  .build();

type GateMemory = typeof GateMemory.Type;

/** The account lost on one Backend, as the Gate keeps it. */
export type LostAccount = NonNullable<GateMemory['cloud']>;

/** Where the Gate keeps what it remembers on this device. Realize it on any
 * StdTable adapter: Memory, IDB in a browser, SQLite on a phone. */
export const gateTable = StdTable.make('auth-gate').primary('pk', 'sk').build();

/** A place to keep `gateTable`. */
export type GateTable = Layer.Layer<
  StdTableService<typeof gateTable.logicalName>
>;

const memory = gateTable
  .singleEntity(GateMemory)
  .default({ backend: null, cloud: null, local: null });

/** Reads and changes what the Gate remembers, kept in `table`. */
export const gateMemory = (table: GateTable) => ({
  read: memory.get().pipe(
    Effect.map(({ value }): GateMemory => value),
    Effect.provide(table),
    Effect.orDie,
  ),
  update: (change: (current: GateMemory) => GateMemory) =>
    memory
      .getAndUpdate(change)
      .pipe(Effect.provide(table), Effect.orDie, Effect.asVoid),
});
