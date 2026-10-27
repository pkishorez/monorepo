import { Context, Effect, Layer, Schema, Stream } from 'effect';
import {
  type DatabaseError,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { account } from '../store/index.ts';
import { broadcast, placed, RETRIES } from '../store/rows/index.ts';

/*
 * What the Machines of an Account keep on this device: in the Account's
 * database, its Machine List as Cloud Connect last listed it (kept by the
 * cache, `machine/store/`) and the Machine Filter; under it, one database
 * per Machine, pruned to the Machines listed on Cloud Connect's first real
 * answer.
 *
 * 1. Name    each Machine's database, under the prefix of every Machine's
 *            database of an Account.
 * 2. Filter  local storage, in the `sidebar` table of the Account's
 *            database, since a Machine id is its Account's: the Machine the
 *            sidebar shows, or every Machine. It goes with its Account. The
 *            sidebar reads and writes it; the Project Picker opens on it.
 *            The store is the truth; an actor that shows it reads it again
 *            after every write, from this tab or another.
 *            - Read    the Account's row.
 *            - Write   a read-modify-write that retries when another tab
 *                      wrote first, then rings the Account's doorbell.
 *            - Follow  every write, in this tab or another, as a change to
 *                      read again.
 */

// 1. Name
/** The prefix of every Machine's database of an Account, and all under them. */
export const machines = (accountId: string) => `${account(accountId)}:machine:`;

/** The database of one Machine of an Account. */
export const machine = (accountId: string, machineId: string) =>
  `${machines(accountId)}${machineId}`;

// 2. Filter
/** The Capability that reads and writes each Account's Machine Filter, and says when it changed. */
export class MachineFilter extends Context.Service<
  MachineFilter,
  {
    /** The Machine the sidebar shows; null for every Machine. */
    readonly read: (
      accountId: string,
    ) => Effect.Effect<string | null, DatabaseError>;
    readonly set: (
      accountId: string,
      machineId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    /** Once per write to the Account's filter, here or in another tab; rings while busy fold into one. */
    readonly changes: (accountId: string) => Stream.Stream<void>;
  }
>()('code/MachineFilter') {
  /** The Account's filter now, then after each change; a browser that cannot keep it reads every Machine. */
  static readonly follow = (accountId: string) =>
    Stream.unwrap(
      Effect.map(MachineFilter, (filter) =>
        Stream.concat(Stream.make(undefined), filter.changes(accountId)).pipe(
          Stream.mapEffect(() =>
            filter.read(accountId).pipe(Effect.orElseSucceed(() => null)),
          ),
          Stream.changes,
        ),
      ),
    );
}

const TABLE = 'sidebar';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const ShownSchema = ESchema.make('SidebarMachine', {
  /** The Machine whose Projects the sidebar lists; null for every Machine. */
  machineId: Schema.NullOr(Schema.String),
}).build();

const shown = table.singleEntity(ShownSchema).default({ machineId: null });

const make = (
  layerOf: (database: string) => Layer.Layer<StdTableService<typeof TABLE>>,
) =>
  MachineFilter.of({
    // 1. Read
    read: (accountId) =>
      Effect.map(shown.get(), ({ value }) => value.machineId).pipe(
        Effect.provide(layerOf(account(accountId))),
      ),
    // 2. Write
    set: (accountId, machineId) => {
      const database = account(accountId);
      return shown
        .getAndUpdate(() => ({ machineId }), { retries: RETRIES })
        .pipe(
          Effect.andThen(broadcast(database).ring),
          Effect.asVoid,
          Effect.provide(layerOf(database)),
        );
    },
    // 3. Follow
    changes: (accountId) => broadcast(account(accountId)).rings,
  });

/** The Machine Filter in this browser's IndexedDB, each Account's in its own database. */
export const machineFilterIdb = Layer.sync(MachineFilter, () =>
  make(
    placed(
      (database) =>
        IDB.make(table, {
          database: IDB.database({ databaseName: database }),
          mode: 'disposable',
        }).layer,
    ),
  ),
);

/** The Machine Filter in memory, for a test: each Layer built over the same rows. */
export const machineFilterMemory = () =>
  Layer.sync(MachineFilter, () => make(placed(() => Memory.make(table).layer)));
