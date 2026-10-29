import { Effect, Schema } from 'effect';
import { ESchema, SnapshotTypeSchema } from '../../../eschema/index.js';
import type { TableSnapshot } from '../../../snapshot/index.js';
import type {
  StoredData,
  StoredItem,
  StoredKey,
} from '../../std-table/contract/index.js';
import {
  encodeCompositeKey,
  RESERVED_ENTITY_PREFIX,
} from '../../std-table/key/index.js';

// The Stored contract as rows inside the table (ADR 0021). Every row sits in
// one reserved partition, so one query reads them all, under an entity name
// no app can declare. Each row is a small ESchema document, so it can evolve
// like any row.
//
// Entity and version rows carry the generation of the contract that wrote
// them, and the table row names the committed generation: a row from a later
// generation is invisible until the table row switches to it, so a commit
// that stops part-way leaves the committed contract as it was.

const KeyDerivation = Schema.Struct({
  pk: Schema.Array(Schema.String),
  sk: Schema.Array(Schema.String),
});

const TableIndex = Schema.Struct({
  name: Schema.String,
  pk: Schema.String,
  sk: Schema.String,
});

/** The table row: what the table is, and a hash of the whole contract. */
const TableRow = ESchema.make('StdContractTable', {
  logicalName: Schema.String,
  mode: Schema.Literals(['persistent', 'disposable']),
  hash: Schema.String,
  topology: Schema.Struct({
    primary: Schema.Struct({ pk: Schema.String, sk: Schema.String }),
    localSecondaryIndexes: Schema.Array(TableIndex),
    globalSecondaryIndexes: Schema.Array(TableIndex),
  }),
  /** The Backfills this contract was recorded with; a row of any other is progress only. */
  backfills: Schema.Array(Schema.String),
  /** The committed generation of the entity and version rows. */
  generation: Schema.Int,
}).build();

/** One row per entity: its key paths and access patterns. */
const EntityRow = ESchema.make('StdContractEntity', {
  generation: Schema.Int,
  name: Schema.String,
  kind: Schema.Literals(['keyed', 'single']),
  schema: Schema.String,
  idField: Schema.NullOr(Schema.String),
  primary: KeyDerivation,
  accessPatterns: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      kind: Schema.Literals(['primary', 'lsi', 'gsi']),
      index: Schema.optionalKey(Schema.String),
      ...KeyDerivation.fields,
    }),
  ),
}).build();

/**
 * One row per ESchema version the table reaches: written when first shipped,
 * and rewritten, in a new generation, only when an accepted change loosens it.
 */
const VersionRow = ESchema.make('StdContractVersion', {
  generation: Schema.Int,
  identity: Schema.String,
  kind: Schema.Literals(['struct', 'value', 'entity']),
  idField: Schema.NullOr(Schema.String),
  version: Schema.String,
  shape: SnapshotTypeSchema,
  gap: Schema.Boolean,
}).build();

/** One row per Backfill: what it fills, and how far it got. */
const BackfillRow = ESchema.make('StdContractBackfill', {
  id: Schema.String,
  kind: Schema.Literals(['gap', 'reindex']),
  entity: Schema.String,
  to: Schema.NullOr(Schema.String),
  after: Schema.Array(Schema.String),
  status: Schema.Literals(['running', 'done']),
  cursor: Schema.NullOr(
    Schema.Struct({ pk: Schema.String, sk: Schema.String }),
  ),
  rowsRewritten: Schema.Int,
  startedAt: Schema.NullOr(Schema.String),
  finishedAt: Schema.NullOr(Schema.String),
  /**
   * The hash of the contract this progress was made toward. Until a
   * committed contract lists the Backfill, progress toward another target
   * counts for nothing.
   */
  target: Schema.String,
}).build();

export type TableRow = typeof TableRow.Type;
export type EntityRow = typeof EntityRow.Type;
export type VersionRow = typeof VersionRow.Type;
export type BackfillRow = typeof BackfillRow.Type;

const ROWS = {
  table: { entity: `${RESERVED_ENTITY_PREFIX}table`, schema: TableRow },
  entity: { entity: `${RESERVED_ENTITY_PREFIX}entity`, schema: EntityRow },
  version: { entity: `${RESERVED_ENTITY_PREFIX}version`, schema: VersionRow },
  backfill: {
    entity: `${RESERVED_ENTITY_PREFIX}backfill`,
    schema: BackfillRow,
  },
} as const;

type RowKind = keyof typeof ROWS;
interface RowValue {
  readonly table: TableRow;
  readonly entity: EntityRow;
  readonly version: VersionRow;
  readonly backfill: BackfillRow;
}

/** The one partition every contract row lives in. */
export const CONTRACT_PARTITION = encodeCompositeKey([
  `${RESERVED_ENTITY_PREFIX}contract`,
]);

const keyOf = (kind: RowKind, ...parts: readonly string[]): StoredKey => ({
  pk: CONTRACT_PARTITION,
  sk: encodeCompositeKey([kind, ...parts]),
});

export const TABLE_ROW_KEY = keyOf('table');

export const rowKey = <K extends RowKind>(
  kind: K,
  value: RowValue[K],
): StoredKey => {
  switch (kind) {
    case 'table':
      return TABLE_ROW_KEY;
    case 'entity':
      return keyOf(
        'entity',
        (value as EntityRow).name,
        String((value as EntityRow).generation),
      );
    case 'version': {
      const row = value as VersionRow;
      return keyOf(
        'version',
        row.identity,
        row.version,
        String(row.generation),
      );
    }
    default:
      return keyOf('backfill', (value as BackfillRow).id);
  }
};

/** A contract row as the stored item it is written as. */
export const rowItem = <K extends RowKind>(
  kind: K,
  value: RowValue[K],
  updated: string,
): Effect.Effect<StoredItem> =>
  Schema.encodeEffect(
    ROWS[kind].schema.schema as unknown as Schema.Codec<
      RowValue[K],
      StoredData
    >,
  )(value).pipe(
    Effect.orDie,
    Effect.map((data) => ({
      ...rowKey(kind, value),
      meta: { _e: ROWS[kind].entity, _u: updated, _d: false },
      data,
      keys: {},
    })),
  );

/** The Stored contract's rows as they were read, each with the `_u` it was read at. */
export interface ContractRows {
  readonly table?: { readonly value: TableRow; readonly _u: string };
  readonly entities: readonly EntityRow[];
  readonly versions: readonly VersionRow[];
  readonly backfills: readonly BackfillRow[];
}

export const NO_ROWS: ContractRows = {
  entities: [],
  versions: [],
  backfills: [],
};

const decodeAs = <K extends RowKind>(kind: K, item: StoredItem) =>
  Schema.decodeUnknownEffect(
    ROWS[kind].schema.schema as unknown as Schema.Codec<RowValue[K], unknown>,
  )(item.data);

/** The table row alone, or nothing when the table has none. */
export const tableRowOf = (
  item: StoredItem | null,
): Effect.Effect<ContractRows['table'], Schema.SchemaError> =>
  item === null
    ? Effect.succeed(undefined)
    : Effect.map(decodeAs('table', item), (value) => ({
        value,
        _u: item.meta._u,
      }));

/** Every contract row read from the reserved partition. */
export const contractRowsOf = (
  items: readonly StoredItem[],
): Effect.Effect<ContractRows, unknown> =>
  Effect.gen(function* () {
    let table: ContractRows['table'];
    const entities: EntityRow[] = [];
    const versions: VersionRow[] = [];
    const backfills: BackfillRow[] = [];
    for (const item of items) {
      const kind = (Object.keys(ROWS) as RowKind[]).find(
        (candidate) => ROWS[candidate].entity === item.meta._e,
      );
      if (kind === 'table') table = yield* tableRowOf(item);
      else if (kind === 'entity')
        entities.push(yield* decodeAs('entity', item));
      else if (kind === 'version')
        versions.push(yield* decodeAs('version', item));
      else if (kind === 'backfill')
        backfills.push(yield* decodeAs('backfill', item));
      else
        return yield* Effect.fail(
          new Error(`Unknown contract row "${item.meta._e}"`),
        );
    }
    return {
      ...(table === undefined ? {} : { table }),
      entities,
      versions,
      backfills,
    };
  });

const compare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const versionNumber = (version: string) => Number(version.slice(1));

export const entityRowKey = (row: EntityRow) => row.name;
export const versionRowKey = (row: VersionRow) =>
  `${row.identity}@${row.version}`;

/** The committed generation; 0 when no contract is committed. */
export const committedGeneration = (rows: ContractRows): number =>
  rows.table?.value.generation ?? 0;

/** Per logical key, the row of the newest generation at most `generation`. */
const newestUpTo = <R extends { readonly generation: number }>(
  rows: readonly R[],
  key: (row: R) => string,
  generation: number,
): readonly R[] => {
  const newest = new Map<string, R>();
  for (const row of rows) {
    if (row.generation > generation) continue;
    const found = newest.get(key(row));
    if (found === undefined || found.generation < row.generation)
      newest.set(key(row), row);
  }
  return [...newest.values()];
};

/** The entity and version rows the committed contract consists of. */
export const committedRows = (rows: ContractRows) => {
  const generation = committedGeneration(rows);
  return {
    entities: newestUpTo(rows.entities, entityRowKey, generation),
    versions: newestUpTo(rows.versions, versionRowKey, generation),
  };
};

/** The table snapshot the committed rows record; the caller validates it. */
export const joinSnapshot = (rows: ContractRows): TableSnapshot | undefined => {
  if (rows.table === undefined) return undefined;
  const table = rows.table.value;
  const committed = committedRows(rows);
  const identities = [
    ...new Set(committed.versions.map(({ identity }) => identity)),
  ].sort(compare);
  const recorded = new Set(table.backfills);
  return {
    logicalName: table.logicalName,
    topology: table.topology,
    entities: committed.entities
      .map(({ generation: _generation, ...entity }) => entity)
      .sort((a, b) => compare(a.name, b.name)),
    schemas: identities.map((identity) => {
      const versions = committed.versions
        .filter((row) => row.identity === identity)
        .sort((a, b) => versionNumber(a.version) - versionNumber(b.version));
      const first = versions[0]!;
      return {
        identity,
        kind: first.kind,
        idField: first.idField,
        versions: versions.map(({ version, shape, gap }) => ({
          version,
          shape,
          gap,
        })),
      };
    }),
    backfills: rows.backfills
      .filter(({ id }) => recorded.has(id))
      .map(({ id, kind, entity, to, after }) => ({
        id,
        kind,
        entity,
        to,
        after,
      }))
      .sort((a, b) => compare(a.id, b.id)),
  };
};

/** A Backfill's progress, as its row keeps it. */
export type BackfillProgress = Pick<
  BackfillRow,
  'id' | 'status' | 'cursor' | 'rowsRewritten' | 'startedAt' | 'finishedAt'
>;

/** Splits a table snapshot into the rows that record it. */
export const splitSnapshot = (
  snapshot: TableSnapshot,
  options: {
    readonly mode: TableRow['mode'];
    readonly hash: string;
    readonly generation: number;
    readonly progress: (id: string) => BackfillProgress;
  },
): {
  readonly table: TableRow;
  readonly entities: readonly EntityRow[];
  readonly versions: readonly VersionRow[];
  readonly backfills: readonly BackfillRow[];
} => ({
  table: {
    logicalName: snapshot.logicalName,
    mode: options.mode,
    hash: options.hash,
    topology: snapshot.topology,
    backfills: snapshot.backfills.map(({ id }) => id),
    generation: options.generation,
  },
  entities: snapshot.entities.map((entity) => ({
    generation: options.generation,
    ...entity,
  })),
  versions: snapshot.schemas.flatMap(({ identity, kind, idField, versions }) =>
    versions.map(({ version, shape, gap }) => ({
      generation: options.generation,
      identity,
      kind,
      idField,
      version,
      shape,
      gap,
    })),
  ),
  backfills: snapshot.backfills.map((backfill) => ({
    ...backfill,
    ...options.progress(backfill.id),
    target: options.hash,
  })),
});

/** The rows of a Backfill declared in `snapshot`, with new progress. */
export const backfillRow = (
  snapshot: TableSnapshot,
  target: string,
  progress: BackfillProgress,
): BackfillRow => {
  const declared = snapshot.backfills.find(({ id }) => id === progress.id);
  if (declared === undefined)
    throw new Error(`Backfill "${progress.id}" is not declared`);
  return { ...declared, ...progress, target };
};
