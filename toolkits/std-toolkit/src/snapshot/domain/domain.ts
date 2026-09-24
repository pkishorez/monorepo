import { Schema } from 'effect';
import { ESchema, toSchema } from '../../eschema/index.js';

// ─── JSON ───────────────────────────────────────────────────────────────────

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * A JSON value written as a structural schema (union, array, record, suspend)
 * rather than Effect's `Schema.Json` declaration, so it passes the ESchema
 * field policy and every snapshot document can itself be an ESchema.
 */
export const JsonValueSchema: Schema.Codec<JsonValue, JsonValue> =
  Schema.suspend(
    (): Schema.Codec<JsonValue, JsonValue> =>
      Schema.Union([
        Schema.String,
        Schema.Number,
        Schema.Boolean,
        Schema.Null,
        Schema.Array(JsonValueSchema),
        Schema.Record(Schema.String, JsonValueSchema),
      ]) as unknown as Schema.Codec<JsonValue, JsonValue>,
  ) as unknown as Schema.Codec<JsonValue, JsonValue>;

// ─── Changes ────────────────────────────────────────────────────────────────

export const SnapshotImpactSchema = Schema.Literals([
  'safe',
  'requires-backfill',
  'breaking',
  'unverifiable',
]);
export type SnapshotImpact = typeof SnapshotImpactSchema.Type;

export const SnapshotSubjectKindSchema = Schema.Literals([
  'snapshot',
  'eschema',
  'version',
  'migration',
  'table',
  'entity',
  'primary-index',
  'local-secondary-index',
  'global-secondary-index',
  'access-pattern',
]);
export type SnapshotSubjectKind = typeof SnapshotSubjectKindSchema.Type;

export const SnapshotMarkerSchema = Schema.Struct({
  path: Schema.String,
  kind: Schema.String,
  message: Schema.String,
});
export type SnapshotMarker = typeof SnapshotMarkerSchema.Type;

export const SnapshotTransformationSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
});
export type SnapshotTransformation = typeof SnapshotTransformationSchema.Type;

export const SnapshotDiagnosticSchema = Schema.Struct({
  path: Schema.String,
  kind: Schema.String,
  message: Schema.String,
});
export type SnapshotDiagnostic = typeof SnapshotDiagnosticSchema.Type;

export const SnapshotSubjectSchema = Schema.Struct({
  kind: SnapshotSubjectKindSchema,
  name: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
});
export type SnapshotSubject = typeof SnapshotSubjectSchema.Type;

export const SnapshotEditSchema = Schema.Struct({
  side: Schema.optional(
    Schema.Literals(['encoded', 'decoded', 'encoded-and-decoded', 'contract']),
  ),
  path: Schema.Array(Schema.String),
  before: Schema.optional(JsonValueSchema),
  after: Schema.optional(JsonValueSchema),
});
export type SnapshotEdit = typeof SnapshotEditSchema.Type;

export const SnapshotChangeSchema = Schema.Struct({
  impact: SnapshotImpactSchema,
  subject: SnapshotSubjectSchema,
  action: Schema.Literals(['added', 'removed', 'edited']),
  edits: Schema.Array(SnapshotEditSchema),
});
export type SnapshotChange = typeof SnapshotChangeSchema.Type;

// ─── ESchema definitions ────────────────────────────────────────────────────

export const ESchemaVersionSchema = Schema.Struct({
  version: Schema.String,
  encoded: JsonValueSchema,
  decoded: JsonValueSchema,
  transformations: Schema.Array(SnapshotTransformationSchema),
  unverifiable: Schema.Array(SnapshotMarkerSchema),
});
export type ESchemaVersion = typeof ESchemaVersionSchema.Type;

export const ESchemaDefinitionSchema = Schema.Struct({
  identity: Schema.String,
  kind: Schema.Literals(['struct', 'value', 'entity']),
  idField: Schema.NullOr(Schema.String),
  versions: Schema.Array(ESchemaVersionSchema),
});
export type ESchemaDefinition = typeof ESchemaDefinitionSchema.Type;

// ─── Table topology ─────────────────────────────────────────────────────────

export const TableIndexSnapshotSchema = Schema.Struct({
  name: Schema.String,
  pk: Schema.String,
  sk: Schema.String,
});
export type TableIndexSnapshot = typeof TableIndexSnapshotSchema.Type;

export const TableTopologySnapshotSchema = Schema.Struct({
  primary: Schema.Struct({ pk: Schema.String, sk: Schema.String }),
  localSecondaryIndexes: Schema.Array(TableIndexSnapshotSchema),
  globalSecondaryIndexes: Schema.Array(TableIndexSnapshotSchema),
});
export type TableTopologySnapshot = typeof TableTopologySnapshotSchema.Type;

export const TableEntityDerivationSnapshotSchema = Schema.Struct({
  pk: Schema.Array(Schema.String),
  sk: Schema.Array(Schema.String),
});
export type TableEntityDerivationSnapshot =
  typeof TableEntityDerivationSnapshotSchema.Type;

export const TableAccessPatternSnapshotSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(['primary', 'lsi', 'gsi']),
  index: Schema.optional(Schema.String),
  ...TableEntityDerivationSnapshotSchema.fields,
});
export type TableAccessPatternSnapshot =
  typeof TableAccessPatternSnapshotSchema.Type;

export const TableEntitySnapshotSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(['keyed', 'single']),
  schema: Schema.String,
  idField: Schema.NullOr(Schema.String),
  primary: TableEntityDerivationSnapshotSchema,
  accessPatterns: Schema.Array(TableAccessPatternSnapshotSchema),
});
export type TableEntitySnapshot = typeof TableEntitySnapshotSchema.Type;

// ─── Documents ──────────────────────────────────────────────────────────────
//
// Every stored snapshot document is an ESchema of its own, so a document
// written by an older toolkit reads forward through a normal migration
// instead of becoming unreadable. Structural validation (dangling references,
// duplicates) runs after decode, since an ESchema struct carries no filters.

export const ESchemaSnapshotESchema = ESchema.make('ESchemaSnapshot', {
  kind: Schema.Literal('eschema'),
  root: Schema.String,
  schemas: Schema.Array(ESchemaDefinitionSchema),
}).build();
export type ESchemaSnapshot = typeof ESchemaSnapshotESchema.Type;

export const TableSnapshotESchema = ESchema.make('TableSnapshot', {
  kind: Schema.Literal('table'),
  logicalName: Schema.String,
  topology: TableTopologySnapshotSchema,
  entities: Schema.Array(TableEntitySnapshotSchema),
  schemas: Schema.Array(ESchemaDefinitionSchema),
}).build();
export type TableSnapshot = typeof TableSnapshotESchema.Type;

export type ContractSnapshot = ESchemaSnapshot | TableSnapshot;

/** One generated value of `from` and what the migration into `to` makes of it. */
export const GoldenRowSchema = Schema.Struct({
  input: JsonValueSchema,
  output: JsonValueSchema,
});
export type GoldenRow = typeof GoldenRowSchema.Type;

export const GoldenStepSchema = Schema.Struct({
  schema: Schema.String,
  from: Schema.String,
  to: Schema.String,
  rows: Schema.Array(GoldenRowSchema),
});
export type GoldenStep = typeof GoldenStepSchema.Type;

/**
 * What a test suite commits per table: the schema contract plus golden rows
 * for every migration step. Rows never enter a table; they live here only.
 */
export const TableSnapshotFileESchema = ESchema.make('TableSnapshotFile', {
  snapshot: toSchema(TableSnapshotESchema),
  goldenRows: Schema.Array(GoldenStepSchema),
}).build();
export type TableSnapshotFile = typeof TableSnapshotFileESchema.Type;

// ─── Structural validation ──────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ESchemaReferenceSchema = Schema.Struct({
  _tag: Schema.Literal('ESchemaRef'),
  identity: Schema.String,
});
const isESchemaReference = Schema.is(ESchemaReferenceSchema);

const referencesIn = (
  value: unknown,
  output = new Set<string>(),
): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((item) => referencesIn(item, output));
  } else if (isRecord(value)) {
    if (isESchemaReference(value)) output.add(value.identity);
    Object.values(value).forEach((item) => referencesIn(item, output));
  }
  return output;
};

export interface SnapshotIssue {
  readonly path: readonly (string | number)[];
  readonly issue: string;
}

const eschemaDefinitionIssues = (
  schemas: readonly ESchemaDefinition[],
): readonly SnapshotIssue[] => {
  const issues: SnapshotIssue[] = [];
  const identities = new Set<string>();
  schemas.forEach((definition, definitionIndex) => {
    if (identities.has(definition.identity)) {
      issues.push({
        path: ['schemas', definitionIndex, 'identity'],
        issue: `Duplicate ESchema identity: ${definition.identity}`,
      });
    }
    identities.add(definition.identity);
    definition.versions.forEach((version, versionIndex) => {
      if (version.version !== `v${versionIndex + 1}`) {
        issues.push({
          path: ['schemas', definitionIndex, 'versions', versionIndex],
          issue: `Non-contiguous or malformed version history: ${definition.identity}`,
        });
      }
    });
  });
  schemas.forEach((definition, definitionIndex) => {
    definition.versions.forEach((version, versionIndex) => {
      for (const reference of referencesIn([
        version.encoded,
        version.decoded,
      ])) {
        if (!identities.has(reference)) {
          issues.push({
            path: ['schemas', definitionIndex, 'versions', versionIndex],
            issue: `Dangling ESchemaRef: ${reference}`,
          });
        }
      }
    });
  });
  return issues;
};

export const eschemaSnapshotIssues = (
  snapshot: ESchemaSnapshot,
): readonly SnapshotIssue[] => {
  const issues = [...eschemaDefinitionIssues(snapshot.schemas)];
  if (!snapshot.schemas.some(({ identity }) => identity === snapshot.root)) {
    issues.push({
      path: ['root'],
      issue: `Missing root ESchema: ${snapshot.root}`,
    });
  }
  return issues;
};

export const tableSnapshotIssues = (
  snapshot: TableSnapshot,
): readonly SnapshotIssue[] => {
  const issues = [...eschemaDefinitionIssues(snapshot.schemas)];
  const schemas = new Set(snapshot.schemas.map(({ identity }) => identity));
  const indexes = new Set<string>();
  const indexesByKind = {
    lsi: new Set<string>(),
    gsi: new Set<string>(),
  };
  const allIndexes = [
    ...snapshot.topology.localSecondaryIndexes.map(
      (index) => ['lsi', index] as const,
    ),
    ...snapshot.topology.globalSecondaryIndexes.map(
      (index) => ['gsi', index] as const,
    ),
  ];
  allIndexes.forEach(([kind, index]) => {
    if (indexes.has(index.name)) {
      issues.push({
        path: ['topology'],
        issue: `Duplicate table index: ${index.name}`,
      });
    }
    indexes.add(index.name);
    indexesByKind[kind].add(index.name);
  });
  const entities = new Set<string>();
  snapshot.entities.forEach((entity, entityIndex) => {
    if (entities.has(entity.name)) {
      issues.push({
        path: ['entities', entityIndex],
        issue: `Duplicate table entity: ${entity.name}`,
      });
    }
    entities.add(entity.name);
    if (!schemas.has(entity.schema)) {
      issues.push({
        path: ['entities', entityIndex, 'schema'],
        issue: `Dangling entity schema ref: ${entity.schema}`,
      });
    }
    const patterns = new Set<string>();
    entity.accessPatterns.forEach((pattern, patternIndex) => {
      if (patterns.has(pattern.name)) {
        issues.push({
          path: ['entities', entityIndex, 'accessPatterns', patternIndex],
          issue: `Duplicate access pattern: ${entity.name}/${pattern.name}`,
        });
      }
      patterns.add(pattern.name);
      if (pattern.kind !== 'primary') {
        const path = [
          'entities',
          entityIndex,
          'accessPatterns',
          patternIndex,
          'index',
        ];
        if (pattern.index === undefined) {
          issues.push({
            path,
            issue: `Access pattern ${entity.name}/${pattern.name} must name a ${pattern.kind} index`,
          });
        } else if (!indexesByKind[pattern.kind].has(pattern.index)) {
          issues.push({
            path,
            issue: `Dangling ${pattern.kind} index ref: ${pattern.index}`,
          });
        }
      }
    });
  });
  return issues;
};

// ─── Errors ─────────────────────────────────────────────────────────────────

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

/**
 * Raised by table-level enforcement when a diff against the table's own
 * stored baseline contains a `breaking` or `unverifiable` change. The
 * baseline is left untouched — only a `safe` or `requires-backfill` diff
 * moves the frozen baseline forward.
 */
export class SnapshotIncompatible extends Error {
  readonly _tag = 'SnapshotIncompatible';

  constructor(readonly changes: readonly SnapshotChange[]) {
    super(
      `Snapshot has ${changes.length} incompatible ${changes.length === 1 ? 'change' : 'changes'} that cannot be safely applied to the deployed table`,
    );
    this.name = 'SnapshotIncompatible';
  }
}

// ─── Ordering ───────────────────────────────────────────────────────────────

export const compareStrings = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(
        ([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
