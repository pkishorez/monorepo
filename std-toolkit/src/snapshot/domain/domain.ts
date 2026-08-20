import { Schema } from 'effect';

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

export const ESchemaVersionSchema = Schema.Struct({
  version: Schema.String,
  encoded: Schema.Json,
  decoded: Schema.Json,
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

const eschemaDefinitionIssues = (
  schemas: readonly ESchemaDefinition[],
): readonly Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
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

export const ESchemaSnapshotSchema = Schema.Struct({
  _v: Schema.Literal('v1'),
  kind: Schema.Literal('eschema'),
  root: Schema.String,
  schemas: Schema.Array(ESchemaDefinitionSchema),
}).check(
  Schema.makeFilter((snapshot) => {
    const issues = [...eschemaDefinitionIssues(snapshot.schemas)];
    if (!snapshot.schemas.some(({ identity }) => identity === snapshot.root)) {
      issues.push({
        path: ['root'],
        issue: `Missing root ESchema: ${snapshot.root}`,
      });
    }
    return issues;
  }),
);
export type ESchemaSnapshot = typeof ESchemaSnapshotSchema.Type;

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

const TableSnapshotShape = Schema.Struct({
  _v: Schema.Literal('v2'),
  kind: Schema.Literal('table'),
  logicalName: Schema.String,
  topology: TableTopologySnapshotSchema,
  entities: Schema.Array(TableEntitySnapshotSchema),
  schemas: Schema.Array(ESchemaDefinitionSchema),
});

export const TableSnapshotSchema = TableSnapshotShape.check(
  Schema.makeFilter((snapshot) => {
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
        issues.push(`Duplicate table index: ${index.name}`);
      }
      indexes.add(index.name);
      indexesByKind[kind].add(index.name);
    });
    const entities = new Set<string>();
    snapshot.entities.forEach((entity, entityIndex) => {
      if (entities.has(entity.name)) {
        issues.push(`Duplicate table entity: ${entity.name}`);
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
          issues.push(
            `Duplicate access pattern: ${entity.name}/${pattern.name}`,
          );
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
  }),
);
export type TableSnapshot = typeof TableSnapshotSchema.Type;

export const ContractSnapshotSchema = Schema.Union([
  ESchemaSnapshotSchema,
  TableSnapshotSchema,
]);
export type ContractSnapshot = typeof ContractSnapshotSchema.Type;

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
  before: Schema.optional(Schema.Json),
  after: Schema.optional(Schema.Json),
});
export type SnapshotEdit = typeof SnapshotEditSchema.Type;

export const SnapshotChangeSchema = Schema.Struct({
  impact: SnapshotImpactSchema,
  subject: SnapshotSubjectSchema,
  action: Schema.Literals(['added', 'removed', 'edited']),
  edits: Schema.Array(SnapshotEditSchema),
});
export type SnapshotChange = typeof SnapshotChangeSchema.Type;

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

export class SnapshotFormatRetired extends SnapshotDecodeError {
  constructor(readonly version: unknown) {
    super(
      `Table snapshot uses the retired ${JSON.stringify(version)} format; move or delete the baseline before approving a new one`,
    );
    this.name = 'SnapshotFormatRetired';
  }
}

export class SnapshotIdentityConflict extends Error {
  readonly _tag = 'SnapshotIdentityConflict';

  constructor(readonly identity: string) {
    super(`Snapshot identity "${identity}" is claimed by different ESchemas`);
    this.name = 'SnapshotIdentityConflict';
  }
}

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
