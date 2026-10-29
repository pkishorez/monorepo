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
 * What the Connections of an Account keep on this device: in the Account's
 * database, its Connection List as Cloud Connect last listed it (kept by the
 * cache, `connection/store/`) and the Connection Filter; under it, one database
 * per Connection, pruned to the Connections listed on Cloud Connect's first real
 * answer.
 *
 * 1. Name    each Connection's database, under the prefix of every Connection's
 *            database of an Account.
 * 2. Filter  local storage, in the `sidebar` table of the Account's
 *            database, since a Connection id is its Account's: the Connection the
 *            sidebar shows, or every Connection. It goes with its Account. The
 *            sidebar reads and writes it; the Project Picker opens on it.
 *            The store is the truth; an actor that shows it reads it again
 *            after every write, from this tab or another.
 *            - Read    the Account's row.
 *            - Write   a read-modify-write that retries when another tab
 *                      wrote first, then rings the Account's doorbell.
 *            - Follow  every write, in this tab or another, as a change to
 *                      read again.
 * 3. Collapsed  local storage beside the Filter, kept and followed alike:
 *            the Connections whose Projects the sidebar hides under their
 *            name, none until one is collapsed.
 */

// 1. Name
/** The prefix of every Connection's database of an Account, and all under them. */
export const connections = (accountId: string) =>
  `${account(accountId)}:connection:`;

/** The database of one Connection of an Account. */
export const connection = (accountId: string, connectionId: string) =>
  `${connections(accountId)}${connectionId}`;

// 2. Filter
/** The Capability that reads and writes each Account's Connection Filter, and says when it changed. */
export class ConnectionFilter extends Context.Service<
  ConnectionFilter,
  {
    /** The Connection the sidebar shows; null for every Connection. */
    readonly read: (
      accountId: string,
    ) => Effect.Effect<string | null, DatabaseError>;
    readonly set: (
      accountId: string,
      connectionId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    /** The Connections the sidebar shows collapsed (3. Collapsed). */
    readonly collapsed: (
      accountId: string,
    ) => Effect.Effect<ReadonlyArray<string>, DatabaseError>;
    readonly setCollapsed: (
      accountId: string,
      connectionIds: ReadonlyArray<string>,
    ) => Effect.Effect<void, DatabaseError>;
    /** Once per write to the Account's filter or its collapsed, here or in another tab; rings while busy fold into one. */
    readonly changes: (accountId: string) => Stream.Stream<void>;
  }
>()('code/ConnectionFilter') {
  /** The Account's filter now, then after each change; a browser that cannot keep it reads every Connection. */
  static readonly follow = (accountId: string) =>
    Stream.unwrap(
      Effect.map(ConnectionFilter, (filter) =>
        Stream.concat(Stream.make(undefined), filter.changes(accountId)).pipe(
          Stream.mapEffect(() =>
            filter.read(accountId).pipe(Effect.orElseSucceed(() => null)),
          ),
          Stream.changes,
        ),
      ),
    );

  /** The Account's collapsed Connections now, then after each change; a browser that cannot keep them reads none. */
  static readonly followCollapsed = (accountId: string) =>
    Stream.unwrap(
      Effect.map(ConnectionFilter, (filter) =>
        Stream.concat(Stream.make(undefined), filter.changes(accountId)).pipe(
          Stream.mapEffect(() =>
            filter
              .collapsed(accountId)
              .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => [])),
          ),
          Stream.changesWith(
            (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
          ),
        ),
      ),
    );
}

const TABLE = 'sidebar';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const ShownSchema = ESchema.make('SidebarConnection', {
  /** The Connection whose Projects the sidebar lists; null for every Connection. */
  connectionId: Schema.NullOr(Schema.String),
}).build();

const shown = table.singleEntity(ShownSchema).default({ connectionId: null });

const CollapsedSchema = ESchema.make('SidebarCollapsed', {
  /** The Connections whose Projects the sidebar hides under their name. */
  connectionIds: Schema.Array(Schema.String),
}).build();

const collapsed = table
  .singleEntity(CollapsedSchema)
  .default({ connectionIds: [] });

const make = (
  layerOf: (database: string) => Layer.Layer<StdTableService<typeof TABLE>>,
) =>
  ConnectionFilter.of({
    // 1. Read
    read: (accountId) =>
      Effect.map(shown.get(), ({ value }) => value.connectionId).pipe(
        Effect.provide(layerOf(account(accountId))),
      ),
    // 2. Write
    set: (accountId, connectionId) => {
      const database = account(accountId);
      return shown
        .getAndUpdate(() => ({ connectionId }), { retries: RETRIES })
        .pipe(
          Effect.andThen(broadcast(database).ring),
          Effect.asVoid,
          Effect.provide(layerOf(database)),
        );
    },
    // 3. Follow
    changes: (accountId) => broadcast(account(accountId)).rings,
    // The Connections collapsed, read and written as the Filter is.
    collapsed: (accountId) =>
      Effect.map(collapsed.get(), ({ value }) => value.connectionIds).pipe(
        Effect.provide(layerOf(account(accountId))),
      ),
    setCollapsed: (accountId, connectionIds) => {
      const database = account(accountId);
      return collapsed
        .getAndUpdate(() => ({ connectionIds: [...connectionIds] }), {
          retries: RETRIES,
        })
        .pipe(
          Effect.andThen(broadcast(database).ring),
          Effect.asVoid,
          Effect.provide(layerOf(database)),
        );
    },
  });

/** The Connection Filter in this browser's IndexedDB, each Account's in its own database. */
export const connectionFilterIdb = Layer.sync(ConnectionFilter, () =>
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

/** The Connection Filter in memory, for a test: each Layer built over the same rows. */
export const connectionFilterMemory = () =>
  Layer.sync(ConnectionFilter, () =>
    make(placed(() => Memory.make(table).layer)),
  );
