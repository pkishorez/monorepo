import { Effect } from 'effect';
import { nextUlid } from '../../core/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import {
  ConditionFailure,
  conditionFailed,
  isInternalEntity,
  type ContractFailure,
  type JsonValue,
  type StdTableContract,
  type StoredData,
  type StoredItem,
  type StoredKey,
  StdTableService,
} from '../std-table/contract/index.js';
import type { DatabaseError } from '../std-table/error/index.js';
import {
  SnapshotEntities,
  type SnapshotValue,
  type SnapshotVersionValue,
} from '../std-table/definition/index.js';
import {
  dbError,
  fromStored,
  fromStoredSingle,
  singleKey,
  toStored,
  toStoredSingle,
} from '../std-table/entity/index.js';
import {
  deriveStorageKey,
  encodeCompositeKey,
  valueReader,
} from '../std-table/key/index.js';
import type { TableMode } from './refusal.js';
import {
  joinTableSnapshot,
  SnapshotUnreadable,
  splitTableSnapshot,
  type SnapshotValues,
  type StoredTableSnapshot,
} from './split.js';

/**
 * The three internal entities' items as one read found them, tombstones
 * included: a write's condition needs the `_u` of every item there.
 */
export interface StoredSnapshot {
  readonly snapshot: StoredItem | null;
  readonly entities: readonly StoredItem[];
  readonly versions: readonly StoredItem[];
}

const PAGE = 100;

const snapshotKey = singleKey(SnapshotEntities.snapshot.name);

const partition = (entity: string) => encodeCompositeKey([entity]);

const readPartition = (contract: StdTableContract, entity: string) =>
  Effect.gen(function* () {
    const items: StoredItem[] = [];
    let startAfter: StoredKey | undefined;
    for (;;) {
      const page = yield* contract.queryItems({
        pk: partition(entity),
        descending: false,
        limit: PAGE,
        consistent: true,
        ...(startAfter === undefined ? {} : { startAfter }),
      });
      items.push(...page.items);
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) return items;
      startAfter = { pk: last.pk, sk: last.sk };
    }
  });

/** Reads every item of the three internal entities. */
export const readStoredSnapshot = (
  contract: StdTableContract,
): Effect.Effect<StoredSnapshot, ContractFailure> =>
  Effect.all(
    {
      snapshot: contract.getItem(snapshotKey, { consistent: true }),
      entities: readPartition(contract, SnapshotEntities.entity.name),
      versions: readPartition(contract, SnapshotEntities.version.name),
    },
    { concurrency: 3 },
  );

const live = (items: readonly StoredItem[]) =>
  items.filter((item) => !item.meta._d);

/** The `__snapshot` item, or `null` when none is stored or it is a tombstone. */
export const recordedSnapshot = (stored: StoredSnapshot): StoredItem | null =>
  stored.snapshot === null || stored.snapshot.meta._d ? null : stored.snapshot;

/** Whether any of the three entities' items is stored, tombstones aside. */
export const hasStoredItems = (stored: StoredSnapshot): boolean =>
  recordedSnapshot(stored) !== null ||
  live(stored.entities).length > 0 ||
  live(stored.versions).length > 0;

/**
 * Every stored value, decoded through its ESchema; `snapshot` is `null`
 * when no `__snapshot` is stored.
 */
export const decodeStoredItems = (
  stored: StoredSnapshot,
): Effect.Effect<
  Omit<SnapshotValues, 'snapshot'> & {
    readonly snapshot: SnapshotValue | null;
  },
  SnapshotUnreadable
> =>
  Effect.gen(function* () {
    const record = recordedSnapshot(stored);
    const snapshot =
      record === null
        ? null
        : yield* fromStoredSingle(SnapshotEntities.snapshot.schema, record);
    const entities = yield* Effect.forEach(live(stored.entities), (item) =>
      fromStored(SnapshotEntities.entity.schema, item),
    );
    const versions = yield* Effect.forEach(live(stored.versions), (item) =>
      fromStored(SnapshotEntities.version.schema, item),
    );
    return {
      // The single-entity codec's type is wider than the struct it decodes.
      snapshot: snapshot === null ? null : (snapshot.value as SnapshotValue),
      entities: entities.map(({ value }) => value),
      versions: versions.map(({ value }) => value),
    };
  }).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotUnreadable(
          `Stored snapshot items do not read: ${cause.message}`,
          cause,
        ),
    ),
  );

/**
 * The stored values, decoded through their ESchemas; `undefined` when no
 * `__snapshot` is stored.
 */
export const decodeStoredSnapshot = (
  stored: StoredSnapshot,
): Effect.Effect<SnapshotValues | undefined, SnapshotUnreadable> =>
  decodeStoredItems(stored).pipe(
    Effect.map(({ snapshot, ...rest }) =>
      snapshot === null ? undefined : { ...rest, snapshot },
    ),
  );

/**
 * The table's Stored snapshot, read strongly consistently and joined; `null`
 * when no `__snapshot` is stored, as before any setup. It reads through the
 * table's own layer, and writes nothing.
 */
export const storedTableSnapshot = <Name extends string>(table: {
  readonly logicalName: Name;
}): Effect.Effect<
  StoredTableSnapshot | null,
  DatabaseError | SnapshotUnreadable,
  StdTableService<Name>
> =>
  Effect.gen(function* () {
    const { contract } = yield* StdTableService(table.logicalName);
    const stored = yield* readStoredSnapshot(contract).pipe(
      Effect.mapError((failure) => dbError('storedTableSnapshot', failure)),
    );
    const values = yield* decodeStoredSnapshot(stored);
    return values === undefined ? null : yield* joinTableSnapshot(values);
  }).pipe(
    Effect.withSpan('StdTable.storedTableSnapshot', {
      attributes: { entity: table.logicalName },
    }),
  );

/**
 * The stored mode, read from the raw `__snapshot` item even when it does not
 * decode; a mode it does not name reads as persistent, the cautious reading.
 */
export const storedMode = (item: StoredItem): TableMode =>
  item.data.mode === 'disposable' ? 'disposable' : 'persistent';

/** Whether the table holds an item of any entity but the internal ones. */
export const tableHasRows = (
  contract: StdTableContract,
): Effect.Effect<boolean, ContractFailure> =>
  Effect.gen(function* () {
    let startAfter: StoredKey | undefined;
    for (;;) {
      const page = yield* contract.scanItems({
        limit: PAGE,
        ...(startAfter === undefined ? {} : { startAfter }),
      });
      if (page.items.some((item) => !isInternalEntity(item.meta._e)))
        return true;
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) return false;
      startAfter = { pk: last.pk, sk: last.sk };
    }
  });

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** JSON with its keys sorted, so key order never reads as a change. */
const canonical = (value: JsonValue): string =>
  JSON.stringify(value, (_, each: unknown) =>
    typeof each === 'object' && each !== null && !Array.isArray(each)
      ? Object.fromEntries(
          Object.entries(each).sort(([a], [b]) => compare(a, b)),
        )
      : each,
  );

interface Desired {
  readonly entity: string;
  readonly key: StoredKey;
  readonly data: StoredData;
}

const target = ({ pk, sk }: StoredKey) => `${pk}\0${sk}`;

const encodeSnapshot = (value: SnapshotValue) =>
  toStoredSingle(
    SnapshotEntities.snapshot.schema,
    value,
    SnapshotEntities.snapshot.name,
  ).pipe(
    Effect.map((encoded): Desired => ({
      entity: SnapshotEntities.snapshot.name,
      key: snapshotKey,
      data: encoded.value,
    })),
  );

const encodeKeyed = <
  E extends typeof SnapshotEntities.entity | typeof SnapshotEntities.version,
>(
  entity: E,
  value: E['schema']['Type'],
) =>
  toStored(entity.schema, value, entity.name).pipe(
    Effect.map((encoded): Desired => ({
      entity: entity.name,
      key: deriveStorageKey(entity.name, valueReader(value), entity.primary),
      data: encoded.value,
    })),
  );

/**
 * The versions in the order they are written: each schema after every
 * schema its versions name, and each schema's versions by position. A setup
 * stopped midway then leaves no version naming a schema with none stored,
 * and no schema with a gap in its versions.
 */
const inWriteOrder = (versions: readonly SnapshotVersionValue[]) => {
  const named = new Map<string, Set<string>>();
  for (const { schema, shape } of versions) {
    const names = named.get(schema) ?? new Set<string>();
    for (const name of TableSnapshot.references(shape)) names.add(name);
    named.set(schema, names);
  }
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (schema: string) => {
    if (visited.has(schema)) return;
    visited.add(schema);
    [...(named.get(schema) ?? [])].sort(compare).forEach(visit);
    order.push(schema);
  };
  [...named.keys()].sort(compare).forEach(visit);
  const rank = new Map(order.map((schema, at) => [schema, at]));
  return [...versions].sort(
    (left, right) =>
      rank.get(left.schema)! - rank.get(right.schema)! ||
      left.position - right.position,
  );
};

/**
 * The stored `__snapshot` with the indexes the code adds, and nothing else
 * changed, the mode included. Written before any entity item, it leaves no
 * item naming an index `__snapshot` lacks. One that does not read, which
 * only a disposable table's wipe writes over, becomes the code's under the
 * stored mode.
 */
const widenedSnapshot = (
  record: StoredItem,
  code: SnapshotValue,
): Effect.Effect<SnapshotValue> =>
  fromStoredSingle(SnapshotEntities.snapshot.schema, record).pipe(
    Effect.map(({ value }) => {
      // The single-entity codec's type is wider than the struct it decodes.
      const prior = value as SnapshotValue;
      const taken = new Set(
        [...prior.localSecondaryIndexes, ...prior.globalSecondaryIndexes].map(
          ({ name }) => name,
        ),
      );
      const added = <T extends { readonly name: string }>(
        indexes: readonly T[],
      ) => indexes.filter(({ name }) => !taken.has(name));
      return {
        ...prior,
        localSecondaryIndexes: [
          ...prior.localSecondaryIndexes,
          ...added(code.localSecondaryIndexes),
        ],
        globalSecondaryIndexes: [
          ...prior.globalSecondaryIndexes,
          ...added(code.globalSecondaryIndexes),
        ],
      };
    }),
    Effect.orElseSucceed(() => ({ ...code, mode: storedMode(record) })),
  );

interface Write {
  readonly item: StoredItem;
  readonly condition:
    | { readonly kind: 'not-exists' }
    | { readonly kind: 'updated'; readonly value: string };
}

const putsFor = (
  desired: readonly Desired[],
  existing: readonly StoredItem[],
  version: string,
): Write[] => {
  const found = new Map(existing.map((item) => [target(item), item]));
  return desired.flatMap((want): Write[] => {
    const prior = found.get(target(want.key));
    if (
      prior !== undefined &&
      !prior.meta._d &&
      canonical(prior.data) === canonical(want.data)
    )
      return [];
    return [
      {
        item: {
          ...want.key,
          meta: { _e: want.entity, _u: version, _d: false },
          data: want.data,
          keys: {},
        },
        condition:
          prior === undefined
            ? { kind: 'not-exists' }
            : { kind: 'updated', value: prior.meta._u },
      },
    ];
  });
};

/** A stored item the code no longer has becomes a tombstone, under the same condition as any write. */
const tombstonesFor = (
  desired: readonly Desired[],
  existing: readonly StoredItem[],
  version: string,
): Write[] => {
  const wanted = new Set(desired.map(({ key }) => target(key)));
  return existing
    .filter((item) => !item.meta._d && !wanted.has(target(item)))
    .map((item) => ({
      item: { ...item, meta: { ...item.meta, _u: version, _d: true } },
      condition: { kind: 'updated', value: item.meta._u },
    }));
};

const isConditionFailure = (cause: unknown): cause is ConditionFailure =>
  cause instanceof ConditionFailure;

/**
 * Whether another setup wrote exactly this item since it was read. Then the
 * write's outcome is already there, and nothing it guards is lost: every
 * item that differs keeps its own condition.
 */
const alreadyWritten = (contract: StdTableContract, item: StoredItem) =>
  contract
    .getItem({ pk: item.pk, sk: item.sk }, { consistent: true })
    .pipe(
      Effect.map(
        (found) =>
          found !== null &&
          found.meta._e === item.meta._e &&
          found.meta._d === item.meta._d &&
          canonical(found.data) === canonical(item.data),
      ),
    );

/**
 * Every write that takes the stored items to the code's, in an order where
 * every prefix joins into a stored snapshot the next setup can compare
 * against, whether it runs this code or the code before:
 *
 * 1. When `__snapshot` is stored, `widenedSnapshot`: the indexes the code
 *    adds. With none stored, the check reads entity and version items under
 *    the code's topology.
 * 2. Versions, in `inWriteOrder`.
 * 3. Entities, which may then name any new index and any new version.
 * 4. Tombstones for the entities, then the versions, the code no longer has.
 *    Only a wipe leads to them, and it leaves no rows a stopped write could
 *    strand: a prefix that does not join is wiped again.
 * 5. `__snapshot` as the code has it, last: its mode, and the indexes it
 *    removes, which no entity names by now.
 */
const writesFor = (
  values: SnapshotValues,
  stored: StoredSnapshot,
  version: string,
) =>
  Effect.gen(function* () {
    const record = recordedSnapshot(stored);
    const recorded = stored.snapshot === null ? [] : [stored.snapshot];
    const opening =
      record === null
        ? []
        : putsFor(
            [
              yield* encodeSnapshot(
                yield* widenedSnapshot(record, values.snapshot),
              ),
            ],
            [record],
            version,
          );
    const closing = putsFor(
      [yield* encodeSnapshot(values.snapshot)],
      opening.length === 0 ? recorded : opening.map(({ item }) => item),
      version,
    );
    const versions = yield* Effect.forEach(
      inWriteOrder(values.versions),
      (value) => encodeKeyed(SnapshotEntities.version, value),
    );
    const entities = yield* Effect.forEach(values.entities, (value) =>
      encodeKeyed(SnapshotEntities.entity, value),
    );
    return [
      ...opening,
      ...putsFor(versions, stored.versions, version),
      ...putsFor(entities, stored.entities, version),
      ...tombstonesFor(entities, stored.entities, version),
      ...tombstonesFor(versions, stored.versions, version),
      ...closing,
    ];
  }).pipe(Effect.orDie);

/**
 * Writes the items of the code's snapshot that differ from the stored ones,
 * each under its own condition: `not-exists` for a new item, `updated` against
 * the `_u` read for a changed one. They go in the order `writesFor` gives, so
 * a setup stopped between two writes leaves a stored snapshot the next one
 * reads. A condition that fails means another setup wrote first. An item it
 * wrote just as this one would is left, and the table is read again at the
 * end: the write fails with `ConditionFailure` unless the table then holds
 * exactly this snapshot. `localIndexOrder` is as `splitTableSnapshot` takes
 * it. Returns how many items were written.
 */
export const writeTableSnapshot = (
  contract: StdTableContract,
  stored: StoredSnapshot,
  current: TableSnapshot,
  mode: TableMode,
  localIndexOrder?: readonly string[],
): Effect.Effect<number, ContractFailure> =>
  Effect.gen(function* () {
    const values = splitTableSnapshot(current, mode, localIndexOrder);
    const version = yield* nextUlid;
    const writes = yield* writesFor(values, stored, version);
    let skipped = false;
    for (const write of writes)
      yield* contract.writeItem(write).pipe(
        Effect.catchIf(isConditionFailure, (cause) =>
          alreadyWritten(contract, write.item).pipe(
            Effect.flatMap((same) => {
              skipped ||= same;
              return same ? Effect.void : Effect.fail(cause);
            }),
          ),
        ),
      );
    // An item left to another setup proves only itself: the other may have
    // written items this one never read, such as a newer version. The table
    // holds this snapshot only if nothing is left to write.
    if (skipped) {
      const after = yield* readStoredSnapshot(contract);
      if ((yield* writesFor(values, after, version)).length > 0)
        return yield* Effect.fail(conditionFailed());
    }
    return writes.length;
  });
