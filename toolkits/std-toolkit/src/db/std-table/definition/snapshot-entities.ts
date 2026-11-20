import { Schema } from 'effect';
import {
  EntityESchema,
  ESchema,
  type SnapshotType,
} from '../../../eschema/index.js';

/*
 * The table snapshot, kept in the table itself as three internal entities
 * (ADR 0020). Every StdTable registers them before any entity of the app's.
 * Their fields are their own, not the snapshot document's, so a change to the
 * document never silently changes what a table stores: a change here is a new
 * version of one of these ESchemas.
 */

const IndexRecord = Schema.Struct({
  name: Schema.String,
  pk: Schema.String,
  sk: Schema.String,
});

const KeyDerivationFields = {
  pk: Schema.Array(Schema.String),
  sk: Schema.Array(Schema.String),
};

/*
 * A version's shape, held opaque: the snapshot type language described in
 * itself fills thousands of lines of every snapshot file, and would move them
 * whenever the language gains a node. Joining the items into a table snapshot
 * reads each shape through that language, and refuses one that does not read.
 */
const Shape = ESchema.fromType<SnapshotType>();

/**
 * One item per physical table: its topology and its mode, and the hash of the
 * snapshot every item matches, when they all match one.
 */
export const SnapshotRecord = ESchema.make('__snapshot', {
  logicalName: Schema.String,
  mode: Schema.Literals(['persistent', 'disposable']),
  primary: Schema.Struct({ pk: Schema.String, sk: Schema.String }),
  localSecondaryIndexes: Schema.Array(IndexRecord),
  globalSecondaryIndexes: Schema.Array(IndexRecord),
})
  /**
   * The hash of the code's snapshot, set by the last write of a setup, once
   * every item is as that code has it; null while a setup writes the others.
   * An item from before the hash reads as null, so its table is checked in
   * full once.
   */
  .evolve('v2', { hash: Schema.NullOr(Schema.String) }, (v1) => ({
    ...v1,
    hash: null,
  }))
  .build();

/** One item per entity, keyed by its name, as a table snapshot records it. */
export const SnapshotEntityRecord = EntityESchema.make(
  '__snapshot_entity',
  'name',
  {
    kind: Schema.Literals(['keyed', 'single']),
    schema: Schema.String,
    idField: Schema.NullOr(Schema.String),
    primary: Schema.Struct(KeyDerivationFields),
    accessPatterns: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        kind: Schema.Literals(['primary', 'lsi', 'gsi']),
        index: Schema.optionalKey(Schema.String),
        ...KeyDerivationFields,
      }),
    ),
  },
).build();

/**
 * One item per version of every ESchema the table reaches, keyed by
 * `<schema>@<version>`. `kind` and `idField` belong to the schema; every
 * version item carries them.
 */
export const SnapshotVersionRecord = EntityESchema.make(
  '__snapshot_version',
  'id',
  {
    schema: Schema.String,
    version: Schema.String,
    /** Its place in the schema's version list, from 0. */
    position: Schema.Int,
    kind: Schema.Literals(['struct', 'value', 'entity']),
    idField: Schema.NullOr(Schema.String),
    shape: Shape,
  },
).build();

export type SnapshotValue = typeof SnapshotRecord.Type;
export type SnapshotEntityValue = typeof SnapshotEntityRecord.Type;
export type SnapshotVersionValue = typeof SnapshotVersionRecord.Type;

/** The three, with the key derivation each is registered under. */
export const SnapshotEntities = {
  snapshot: { name: SnapshotRecord.name, schema: SnapshotRecord },
  entity: {
    name: SnapshotEntityRecord.name,
    schema: SnapshotEntityRecord,
    // An empty partition: one query reads every item.
    primary: { pk: [], sk: [SnapshotEntityRecord.idField] },
  },
  version: {
    name: SnapshotVersionRecord.name,
    schema: SnapshotVersionRecord,
    primary: { pk: [], sk: [SnapshotVersionRecord.idField] },
  },
} as const;
