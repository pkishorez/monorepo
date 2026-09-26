import { Schema } from 'effect';
import { ESchema, SnapshotTypeSchema } from '../../eschema/index.js';

/**
 * One version as it is stored: the snapshot type of its encoded side. For a
 * struct or entity ESchema that is the struct of its fields, and for a value
 * ESchema the value's own type; the `_v` stamp and the `{ _v, _value }`
 * envelope are implied by the kind.
 */
const ESchemaVersionSchema = Schema.Struct({
  version: Schema.String,
  shape: SnapshotTypeSchema,
});

const ESchemaDefinitionSchema = Schema.Struct({
  identity: Schema.String,
  kind: Schema.Literals(['struct', 'value', 'entity']),
  idField: Schema.NullOr(Schema.String),
  versions: Schema.Array(ESchemaVersionSchema),
});

const TableIndexSchema = Schema.Struct({
  name: Schema.String,
  pk: Schema.String,
  sk: Schema.String,
});

const KeyDerivationSchema = Schema.Struct({
  pk: Schema.Array(Schema.String),
  sk: Schema.Array(Schema.String),
});

const TableEntitySchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(['keyed', 'single']),
  schema: Schema.String,
  idField: Schema.NullOr(Schema.String),
  primary: KeyDerivationSchema,
  accessPatterns: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      kind: Schema.Literals(['primary', 'lsi', 'gsi']),
      index: Schema.optionalKey(Schema.String),
      ...KeyDerivationSchema.fields,
    }),
  ),
});

export const TableSnapshotESchema = ESchema.make('TableSnapshot', {
  logicalName: Schema.String,
  topology: Schema.Struct({
    primary: Schema.Struct({ pk: Schema.String, sk: Schema.String }),
    localSecondaryIndexes: Schema.Array(TableIndexSchema),
    globalSecondaryIndexes: Schema.Array(TableIndexSchema),
  }),
  entities: Schema.Array(TableEntitySchema),
  schemas: Schema.Array(ESchemaDefinitionSchema),
}).build();

export type TableSnapshot = typeof TableSnapshotESchema.Type;
export type ESchemaDefinition = TableSnapshot['schemas'][number];
export type ESchemaVersion = ESchemaDefinition['versions'][number];
export type TableIndexSnapshot =
  TableSnapshot['topology']['localSecondaryIndexes'][number];
export type TableEntitySnapshot = TableSnapshot['entities'][number];
export type TableAccessPatternSnapshot =
  TableEntitySnapshot['accessPatterns'][number];

export interface SnapshotChange {
  readonly impact: 'safe' | 'requires-backfill' | 'breaking' | 'unverifiable';
  readonly subject: {
    readonly kind:
      | 'table'
      | 'eschema'
      | 'version'
      | 'entity'
      | 'primary-index'
      | 'local-secondary-index'
      | 'global-secondary-index'
      | 'access-pattern';
    readonly name?: string;
    readonly owner?: string;
    readonly version?: string;
  };
  readonly action: 'added' | 'removed' | 'edited';
  readonly edits: readonly {
    readonly path: readonly string[];
    readonly before?: unknown;
    readonly after?: unknown;
  }[];
}

export class SnapshotDecodeError extends Error {
  readonly _tag = 'SnapshotDecodeError';

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SnapshotDecodeError';
  }
}

export class SnapshotIdentityConflict extends Error {
  readonly _tag = 'SnapshotIdentityConflict';

  constructor(readonly identity: string) {
    super(`Snapshot identity "${identity}" is claimed by different ESchemas`);
    this.name = 'SnapshotIdentityConflict';
  }
}

export class SnapshotIncompatible extends Error {
  readonly _tag = 'SnapshotIncompatible';

  constructor(readonly changes: readonly SnapshotChange[]) {
    super(
      `Snapshot has ${changes.length} incompatible ${changes.length === 1 ? 'change' : 'changes'} that cannot be safely applied to the deployed table`,
    );
    this.name = 'SnapshotIncompatible';
  }
}

export const compareStrings = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
