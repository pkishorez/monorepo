import { Effect } from 'effect';
import { Memory } from '../memory/index.js';
import {
  captureContract,
  NO_ROWS,
  recordContract,
} from '../setup/contract/index.js';
import {
  OperationFailure,
  StdTableService,
  type StdTableContract,
  type StoredItem,
} from '../std-table/contract/index.js';
import type { StdTable } from '../std-table/table/index.js';

// A Memory table as a database looks when some Backfills have not finished:
// its Stored contract records the current snapshot, every other Backfill
// done, and those not; the next setup runs them over every row.

const LONG_AGO = '1970-01-01T00:00:00.000Z';

/** A fresh, empty Memory table's StdTable contract. */
export const memoryStore = (table: StdTable): StdTableContract =>
  Effect.runSync(
    Effect.map(
      StdTableService(table.logicalName),
      ({ contract }) => contract,
    ).pipe(Effect.provide(Memory.make(table).layer)),
  );

/**
 * Records a Stored contract that owes the Backfills `owing`, then writes
 * `items` as they were stored before them. Its hash is not the current one,
 * so setup reads the whole contract, and only `owing` are not trusted as
 * done. Owing every Backfill is a database at the oldest versions.
 */
export const owingBackfills = (
  store: StdTableContract,
  table: StdTable,
  owing: ReadonlySet<string>,
  items: readonly StoredItem[],
): Effect.Effect<void, OperationFailure> =>
  Effect.gen(function* () {
    const current = yield* captureContract(table, 'persistent');
    yield* recordContract(store, {
      current: {
        ...current,
        record: {
          ...current.record,
          hash: `${current.record.hash}~${[...owing].join(',')}`,
        },
      },
      stored: NO_ROWS,
      progress: (other) =>
        owing.has(other)
          ? {
              id: other,
              status: 'running',
              cursor: null,
              rowsRewritten: 0,
              startedAt: LONG_AGO,
              finishedAt: null,
            }
          : {
              id: other,
              status: 'done',
              cursor: null,
              rowsRewritten: 0,
              startedAt: LONG_AGO,
              finishedAt: LONG_AGO,
            },
    });
    yield* Effect.forEach(
      items,
      (item) =>
        store
          .writeItem({ item })
          .pipe(
            Effect.mapError((cause) =>
              cause instanceof OperationFailure
                ? cause
                : new OperationFailure({ cause }),
            ),
          ),
      { discard: true },
    );
  });
