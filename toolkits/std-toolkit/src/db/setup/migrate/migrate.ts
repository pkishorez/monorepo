import { Effect, Option, Stream } from 'effect';
import type { Entity, SingletonEntity } from '../../../core/index.js';
import {
  OperationFailure,
  StdTableService,
  type ContractFailure,
  type StdTableContract,
  type StoredItem,
  type StoredKey,
} from '../../std-table/contract/index.js';
import { fromStored, fromStoredSingle } from '../../std-table/entity/index.js';
import { DatabaseError, EntityNotFound } from '../../std-table/error/index.js';
import { isReservedEntity } from '../../std-table/key/index.js';
import {
  captureContract,
  countContractRows,
  holdsAppRows,
  readMigrationRow,
  readTableRow,
  wipeAppRows,
  writeMigrationRow,
  type MigrationRow,
} from '../contract/index.js';
import {
  MigrationRefused,
  MigrationRowFailed,
  type AnyStdTable,
  type HandlerContext,
  type HandlerError,
  type MigrationEvent,
  type MigrationHandlers,
  type MigrationOptions,
  type NoExtraHandlers,
} from './types.js';

// A table migration (ADR 0022): every row of an old table, through one
// handler per entity, into a new table, once. The new table's migration row
// says how far it got: `running` until every row is through, `done` after.

/**
 * Everything a run can fail with; `E` is what its handlers fail with. A row
 * fails with its handler's error, or with a `DatabaseError` when it does not
 * decode.
 */
export type MigrationError<E = never> =
  | MigrationRefused
  | MigrationRowFailed<E | DatabaseError>
  | DatabaseError
  | OperationFailure;

type Handler = (
  row: Entity<unknown> | SingletonEntity<unknown>,
  tables: unknown,
) => Effect.Effect<unknown, unknown, unknown>;

const failed = (failure: ContractFailure) =>
  failure instanceof OperationFailure
    ? failure
    : new OperationFailure({ cause: failure });

const positive = (name: string, value: number) =>
  Number.isInteger(value) && value >= 1
    ? Effect.void
    : Effect.die(
        new RangeError(`${name} must be a positive integer, got ${value}`),
      );

/**
 * The old table's contract as handlers read it: strongly consistent where
 * the database offers it (DynamoDB's global secondary indexes do not), so a
 * row the scan sees is never missing from a handler's read, and with every
 * write dying, since a migration only reads it.
 */
const readOnly = (
  store: StdTableContract,
  table: Pick<AnyStdTable, 'logicalName' | 'globalSecondaryIndexes'>,
): StdTableContract => {
  const refuse = () =>
    Effect.die(
      new Error(
        `std-toolkit: a table migration only reads the old table "${table.logicalName}"; write to the new one`,
      ),
    );
  return {
    ...store,
    getItem: (key) => store.getItem(key, { consistent: true }),
    queryItems: (request) =>
      store.queryItems(
        request.index !== undefined &&
          request.index in table.globalSecondaryIndexes
          ? request
          : { ...request, consistent: true },
      ),
    writeItem: refuse,
    transactWriteItems: refuse,
    hardDeleteItem: refuse,
    hardDeleteEntityItems: refuse,
    hardDeleteAllItems: refuse,
  };
};

/** The new table's contract, counting every row put through it. */
const counting = (
  store: StdTableContract,
  written: (rows: number) => void,
): StdTableContract => ({
  ...store,
  writeItem: (put) =>
    store.writeItem(put).pipe(Effect.tap(() => Effect.sync(() => written(1)))),
  transactWriteItems: (items) =>
    store
      .transactWriteItems(items)
      .pipe(
        Effect.tap(() =>
          Effect.sync(() =>
            written(items.filter(({ kind }) => kind === 'put').length),
          ),
        ),
      ),
});

const sameSource = (left: MigrationRow['from'], right: MigrationRow['from']) =>
  left.table === right.table && left.hash === right.hash;

const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Moves every row of `old` into `next` once, through one handler per entity
 * of `old` (ADR 0022). Each handler gets one old row, decoded at its latest
 * value with its meta (a tombstone included, as `get` returns one), the old
 * table read-only as `old`, and the new table as `next`; it may write one
 * row, several, or none. `written` counts every row put through `next`.
 *
 * Both tables are needed as layers. The new one must be a persistent table
 * set up under this code, and the old one set up under its declaration here,
 * or holding nothing at all. A run:
 *
 * 1. emits `Skipped` when the new table's migration row says `done` from
 *    this source, and fails when it says `done` from another, or when there
 *    is no row and the new table already holds rows;
 * 2. writes `running`, clearing the new table first when a crashed or failed
 *    run left `running` behind, and emits `Started`;
 * 3. scans the old table page by page, strongly consistent, with
 *    `concurrency` handlers in flight, and after each page records the
 *    counts and emits `Progress`;
 * 4. writes `done` after the last page, and emits `Done`.
 *
 * Any failure fails the stream and leaves `running`, so the next run starts
 * over. One run at a time: a second run started while one is still going
 * takes its `running` row as a crashed run's and starts over under it
 * (ADR 0022 keeps a run to one process for now).
 */
export const migrate = <
  Old extends AnyStdTable,
  Next extends AnyStdTable,
  H extends MigrationHandlers<Old, Next> & NoExtraHandlers<Old, H>,
>(
  old: Old,
  next: Next,
  handlers: H,
  options: MigrationOptions = {},
): Stream.Stream<
  MigrationEvent,
  MigrationError<HandlerError<H>>,
  | StdTableService<Old['logicalName']>
  | StdTableService<Next['logicalName']>
  | HandlerContext<H>
> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const from = old.logicalName;
      const to = next.logicalName;
      if (from === to)
        return yield* Effect.die(
          new Error(
            `std-toolkit: a table migration moves rows into a new StdTable, with its own logical name; both are "${from}"`,
          ),
        );
      const pageSize = options.pageSize ?? 100;
      const concurrency = options.concurrency ?? 1;
      yield* positive('pageSize', pageSize);
      yield* positive('concurrency', concurrency);
      const refused = (reason: MigrationRefused['reason']) =>
        Effect.fail(MigrationRefused.of(reason, from, to));

      const oldStore = (yield* StdTableService(from)).contract;
      const nextStore = (yield* StdTableService(to)).contract;

      const target = yield* readTableRow(nextStore);
      const targetRow = target.kind === 'read' ? target.row : undefined;
      if (targetRow === undefined) return yield* refused('target-not-set-up');
      if (targetRow.value.mode === 'disposable')
        return yield* refused('target-disposable');

      const source = {
        table: from,
        hash: (yield* captureContract(old, 'persistent')).record.hash,
      };
      const row = yield* readMigrationRow(nextStore);
      if (row?.value.state === 'done') {
        if (sameSource(row.value.from, source))
          return Stream.make({ _tag: 'Skipped' } as MigrationEvent);
        return yield* refused('other-source');
      }
      const nextHash = (yield* captureContract(next, 'persistent')).record.hash;
      if (targetRow.value.hash !== nextHash)
        return yield* refused('target-not-set-up');
      if (row === undefined && (yield* holdsAppRows(nextStore)))
        return yield* refused('target-in-use');

      const stored = yield* readTableRow(oldStore);
      if (stored.kind === 'unreadable') return yield* refused('source-changed');
      const sourceRow = stored.row;
      if (sourceRow === undefined) {
        if (yield* holdsAppRows(oldStore))
          return yield* refused('source-changed');
      } else if (sourceRow.value.hash !== source.hash)
        return yield* refused('source-changed');

      const attempt = (row?.value.attempt ?? 0) + 1;
      const restarted = row !== undefined;
      const counts: Record<string, { read: number; written: number }> = {};
      for (const { name } of old.registeredEntities)
        counts[name] = { read: 0, written: 0 };
      const snapshot = () =>
        Object.fromEntries(
          Object.entries(counts).map(([name, count]) => [name, { ...count }]),
        );
      let updated = yield* writeMigrationRow(
        nextStore,
        { from: source, state: 'running', attempt, counts: snapshot() },
        row?._u,
      );
      if (restarted) yield* wipeAppRows(nextStore);

      const started: MigrationEvent = { _tag: 'Started', attempt, restarted };
      const finish = Effect.gen(function* () {
        updated = yield* writeMigrationRow(
          nextStore,
          { from: source, state: 'done', attempt, counts: snapshot() },
          updated,
        );
        return { _tag: 'Done', counts: snapshot() } as const;
      });
      // An old table with no contract holds nothing: it migrates as empty.
      if (sourceRow === undefined)
        return Stream.make(started).pipe(
          Stream.concat(Stream.fromEffect(finish)),
        );

      const total =
        oldStore.estimateItemCount === undefined
          ? undefined
          : Math.max(
              0,
              (yield* oldStore
                .estimateItemCount()
                .pipe(Effect.mapError(failed))) -
                (yield* countContractRows(oldStore)),
            );

      const oldContract = readOnly(oldStore, old);
      const tables = { old, next };
      const migrateRow = (item: StoredItem) =>
        Effect.gen(function* () {
          const entity = item.meta._e;
          const rowFailed = (cause: unknown) =>
            new MigrationRowFailed({
              entity,
              key: { pk: item.pk, sk: item.sk },
              cause: cause as HandlerError<H> | DatabaseError,
              message: `std-toolkit: migrating ${entity} (${item.pk}, ${item.sk}) from "${from}" into "${to}" failed: ${describe(cause)}`,
            });
          const declared = old.registeredEntities.find(
            ({ name }) => name === entity,
          );
          const handler = (handlers as unknown as Record<string, Handler>)[
            entity
          ];
          const count = counts[entity];
          if (
            declared === undefined ||
            handler === undefined ||
            count === undefined
          )
            return yield* Effect.fail(
              rowFailed(
                new DatabaseError({ reason: new EntityNotFound({ entity }) }),
              ),
            );
          count.read++;
          const decoded = yield* (
            declared.kind === 'keyed'
              ? fromStored(declared.schema, item)
              : fromStoredSingle(declared.schema, item)
          ).pipe(Effect.mapError(rowFailed));
          yield* handler(decoded, tables).pipe(
            Effect.provideService(StdTableService(from), {
              contract: oldContract,
            } as StdTableService<string>),
            Effect.provideService(StdTableService(to), {
              contract: counting(nextStore, (rows) => {
                count.written += rows;
              }),
            } as StdTableService<string>),
            Effect.mapError(rowFailed),
          );
        });

      const progress = (): MigrationEvent => {
        const all = Object.values(counts);
        const read = all.reduce((sum, count) => sum + count.read, 0);
        return {
          _tag: 'Progress',
          read,
          written: all.reduce((sum, count) => sum + count.written, 0),
          total: total === undefined ? undefined : Math.max(total, read),
          counts: snapshot(),
        };
      };

      const pages = Stream.paginate(
        undefined as StoredKey | undefined,
        (after) =>
          Effect.gen(function* () {
            const page = yield* oldStore
              .scanItems({
                limit: pageSize,
                consistent: true,
                ...(after === undefined ? {} : { startAfter: after }),
              })
              .pipe(Effect.mapError(failed));
            yield* Effect.forEach(
              page.items.filter(({ meta }) => !isReservedEntity(meta._e)),
              migrateRow,
              { concurrency, discard: true },
            );
            const last = page.items.at(-1);
            if (!page.hasMore || last === undefined) {
              const done = yield* finish;
              return [[progress(), done], Option.none()] as const;
            }
            updated = yield* writeMigrationRow(
              nextStore,
              { from: source, state: 'running', attempt, counts: snapshot() },
              updated,
            );
            return [
              [progress()],
              Option.some<StoredKey | undefined>({ pk: last.pk, sk: last.sk }),
            ] as const;
          }),
      );
      return Stream.make(started).pipe(Stream.concat(pages));
    }),
  ) as never;

const message = (event: MigrationEvent) => {
  switch (event._tag) {
    case 'Skipped':
      return 'std-toolkit: table migration already done';
    case 'Started':
      return `std-toolkit: table migration started, attempt ${event.attempt}${event.restarted ? ', starting over' : ''}`;
    case 'Progress':
      return `std-toolkit: table migration read ${event.read}${event.total === undefined ? '' : ` of about ${event.total}`} rows, wrote ${event.written}`;
    case 'Done':
      return 'std-toolkit: table migration done';
  }
};

/** Runs a table migration to its end, logging each event, and returns the last: `Done` or `Skipped`. */
export const runMigration = <E, R>(
  migration: Stream.Stream<MigrationEvent, E, R>,
): Effect.Effect<
  Extract<MigrationEvent, { readonly _tag: 'Done' | 'Skipped' }>,
  E,
  R
> =>
  migration.pipe(
    Stream.tap((event) => Effect.log(message(event))),
    Stream.runLast,
    Effect.flatMap((last) =>
      Option.isSome(last) &&
      (last.value._tag === 'Done' || last.value._tag === 'Skipped')
        ? Effect.succeed(last.value)
        : Effect.die(
            new Error('std-toolkit: a table migration ended unfinished'),
          ),
    ),
  ) as never;
