import { Effect } from 'effect';
import { nextUlid } from '../../../core/index.js';
import type { TableSnapshot } from '../../../snapshot/index.js';
import {
  ConditionFailure,
  OperationFailure,
  type ContractFailure,
  type StdTableContract,
  type StoredItem,
  type TransactItem,
} from '../../std-table/contract/index.js';
import { isReservedEntity } from '../../std-table/key/index.js';
import {
  backfillRow,
  committedGeneration,
  committedRows,
  contractRowsOf,
  entityRowKey,
  rowKey,
  CONTRACT_PARTITION,
  NO_ROWS,
  rowItem,
  splitSnapshot,
  TABLE_ROW_KEY,
  tableRowOf,
  versionRowKey,
  type BackfillProgress,
  type ContractRows,
  type TableRow,
} from './rows.js';

// Reads and writes the Stored contract's rows through the adapter's own
// StdTable contract, the same on every adapter.

const PAGE = 100;
const TRANSACT_LIMIT = 100;

const failed = (cause: unknown) =>
  cause instanceof OperationFailure ? cause : new OperationFailure({ cause });

/** What a read of the contract found. */
export type ContractRead =
  | { readonly kind: 'read'; readonly rows: ContractRows }
  | { readonly kind: 'unreadable'; readonly cause: unknown };

/** The table row alone: an unchanged table is this one read. */
export const readTableRow = (
  store: StdTableContract,
): Effect.Effect<
  | { readonly kind: 'read'; readonly row: ContractRows['table'] }
  | { readonly kind: 'unreadable'; readonly cause: unknown },
  OperationFailure
> =>
  store.getItem(TABLE_ROW_KEY, { consistent: true }).pipe(
    Effect.mapError(failed),
    Effect.flatMap((item) =>
      tableRowOf(item).pipe(
        Effect.map((row) => ({ kind: 'read' as const, row })),
        Effect.catch((cause) =>
          Effect.succeed({ kind: 'unreadable' as const, cause }),
        ),
      ),
    ),
  );

/** Every contract row, read with one query of the reserved partition. */
export const readContractRows = (
  store: StdTableContract,
): Effect.Effect<ContractRead, OperationFailure> =>
  Effect.gen(function* () {
    const items: StoredItem[] = [];
    let after: StoredItem | undefined;
    for (;;) {
      const page = yield* store
        .queryItems({
          pk: CONTRACT_PARTITION,
          descending: false,
          // A row missing from a stale page would read as never recorded.
          consistent: true,
          limit: PAGE,
          ...(after === undefined
            ? {}
            : { startAfter: { pk: after.pk, sk: after.sk } }),
        })
        .pipe(Effect.mapError(failed));
      items.push(...page.items);
      after = page.items.at(-1);
      if (!page.hasMore || after === undefined) break;
    }
    return yield* contractRowsOf(items).pipe(
      Effect.map((rows) => ({ kind: 'read' as const, rows })),
      Effect.catch((cause) =>
        Effect.succeed({ kind: 'unreadable' as const, cause }),
      ),
    );
  });

/** Whether the table holds any row an app wrote. */
export const holdsAppRows = (
  store: StdTableContract,
): Effect.Effect<boolean, OperationFailure> =>
  Effect.gen(function* () {
    let after: StoredItem | undefined;
    for (;;) {
      const page = yield* store
        .scanItems({
          limit: PAGE,
          consistent: true,
          ...(after === undefined
            ? {}
            : { startAfter: { pk: after.pk, sk: after.sk } }),
        })
        .pipe(Effect.mapError(failed));
      if (page.items.some((item) => !isReservedEntity(item.meta._e)))
        return true;
      after = page.items.at(-1);
      if (!page.hasMore || after === undefined) return false;
    }
  });

/** Deletes every row, the contract's included. */
export const wipeRows = (
  store: StdTableContract,
): Effect.Effect<number, OperationFailure> =>
  store.hardDeleteAllItems().pipe(Effect.mapError(failed));

/** Writes the Backfills' progress rows, as a runner reports it. */
export const writeBackfillProgress = (
  store: StdTableContract,
  snapshot: TableSnapshot,
  target: string,
  progress: readonly BackfillProgress[],
): Effect.Effect<void, OperationFailure> =>
  Effect.forEach(
    progress,
    (entry) =>
      Effect.gen(function* () {
        const item = yield* rowItem(
          'backfill',
          backfillRow(snapshot, target, entry),
          yield* nextUlid,
        );
        yield* store.writeItem({ item }).pipe(Effect.mapError(failed));
      }),
    { discard: true },
  );

const contractMoved = (failure: ContractFailure) =>
  failure instanceof ConditionFailure
    ? new OperationFailure({
        cause: new Error(
          'std-toolkit: another setup recorded a Stored contract after this one read it',
        ),
      })
    : failed(failure);

// Equal content, whatever the key order or generation.
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([key]) => key !== 'generation')
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

/**
 * Records `snapshot` as the Stored contract, in a new generation:
 *
 * 1. Deletes rows a commit that stopped part-way left above the committed
 *    generation.
 * 2. Writes each entity and version row that is new or differs from the
 *    committed one under the new generation, where nothing reads it yet. An
 *    unchanged version row is never rewritten.
 * 3. Writes Backfill rows that changed, then the table row, alone and last,
 *    guarded on the one setup read: this switches the committed generation.
 * 4. Deletes the committed rows the new generation replaced. Failing here
 *    leaves only rows nothing reads.
 */
export const writeContract = (
  store: StdTableContract,
  options: {
    readonly snapshot: TableSnapshot;
    readonly mode: TableRow['mode'];
    readonly hash: string;
    readonly stored: ContractRows;
    readonly progress: (id: string) => BackfillProgress;
  },
): Effect.Effect<void, OperationFailure> =>
  Effect.gen(function* () {
    const { stored } = options;
    const committedGen = committedGeneration(stored);
    const generation = committedGen + 1;
    const rows = splitSnapshot(options.snapshot, { ...options, generation });
    const committed = committedRows(stored);
    const leftovers = [
      ...stored.entities
        .filter((row) => row.generation > committedGen)
        .map((row) => rowKey('entity', row)),
      ...stored.versions
        .filter((row) => row.generation > committedGen)
        .map((row) => rowKey('version', row)),
    ];
    yield* Effect.forEach(
      leftovers,
      (key) => store.hardDeleteItem(key).pipe(Effect.mapError(failed)),
      { discard: true },
    );

    const committedEntities = new Map(
      committed.entities.map((row) => [entityRowKey(row), row]),
    );
    const committedVersions = new Map(
      committed.versions.map((row) => [versionRowKey(row), row]),
    );
    const changedEntities = rows.entities.filter((row) => {
      const found = committedEntities.get(entityRowKey(row));
      return found === undefined || stable(found) !== stable(row);
    });
    const changedVersions = rows.versions.filter((row) => {
      const found = committedVersions.get(versionRowKey(row));
      return found === undefined || stable(found) !== stable(row);
    });
    const storedBackfills = new Map(
      stored.backfills.map((row) => [row.id, row]),
    );
    const updated = yield* nextUlid;
    const staged: TransactItem[] = [];
    for (const row of changedEntities)
      staged.push({
        kind: 'put',
        item: yield* rowItem('entity', row, updated),
        condition: { kind: 'not-exists' },
      });
    for (const row of changedVersions)
      staged.push({
        kind: 'put',
        item: yield* rowItem('version', row, updated),
        condition: { kind: 'not-exists' },
      });
    for (const row of rows.backfills)
      if (stable(storedBackfills.get(row.id)) !== stable(row))
        staged.push({
          kind: 'put',
          item: yield* rowItem('backfill', row, updated),
        });
    for (let start = 0; start < staged.length; start += TRANSACT_LIMIT)
      yield* store
        .transactWriteItems(staged.slice(start, start + TRANSACT_LIMIT))
        .pipe(Effect.mapError(failed));

    yield* store
      .writeItem({
        item: yield* rowItem('table', rows.table, updated),
        condition:
          stored.table === undefined
            ? { kind: 'not-exists' }
            : { kind: 'updated', value: stored.table._u },
      })
      .pipe(Effect.mapError(contractMoved));

    const replaced = [
      ...changedEntities.flatMap((row) => {
        const old = committedEntities.get(entityRowKey(row));
        return old === undefined ? [] : [rowKey('entity', old)];
      }),
      ...changedVersions.flatMap((row) => {
        const old = committedVersions.get(versionRowKey(row));
        return old === undefined ? [] : [rowKey('version', old)];
      }),
    ];
    yield* Effect.forEach(
      replaced,
      (key) => store.hardDeleteItem(key).pipe(Effect.mapError(failed)),
      { discard: true },
    );
  });

export { NO_ROWS };
