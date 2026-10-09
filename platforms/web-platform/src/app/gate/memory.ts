import { Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kstackz/std-toolkit/db';
import { ESchema } from '@kstackz/std-toolkit/eschema';
import { Backend } from '../host/index.ts';

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
});

const Remembered = Schema.Struct({
  /** The Remembered Accounts, as the Backend last named them. */
  accounts: Schema.Array(Schema.Struct({ user: User, active: Schema.Boolean })),
  /** The account found lost, until the User signs in to it again or opens
   * another. */
  lost: Schema.NullOr(User),
});

const GateMemory = ESchema.make('GateMemory', {
  /** The Backend chosen; null until one is. */
  backend: Schema.NullOr(Backend),
  cloud: Remembered,
  device: Remembered,
}).build();

type GateMemory = typeof GateMemory.Type;

const NOBODY: typeof Remembered.Type = { accounts: [], lost: null };

/** Where the Gate keeps what it remembers on this device. Realize it on any
 * StdTable adapter: Memory, IDB in a browser, SQLite on a phone. */
export const gateTable = StdTable.make('auth-gate').primary('pk', 'sk').build();

/** A place to keep `gateTable`. */
export type GateTable = Layer.Layer<
  StdTableService<typeof gateTable.logicalName>
>;

const memory = gateTable
  .singleEntity(GateMemory)
  .default({ backend: null, cloud: NOBODY, device: NOBODY });

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
