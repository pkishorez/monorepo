import { Effect, Schema } from 'effect';
import {
  readEncoded,
  writeEncoded,
} from '../../../eschema/domain/encoded/index.js';
import type { ESchemaDefinition, TableSnapshot } from '../../domain/index.js';
import {
  SnapshotDecodeError,
  TableSnapshotESchema,
} from '../../domain/index.js';

interface SnapshotIssue {
  readonly path: readonly (string | number)[];
  readonly issue: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isESchemaReference = Schema.is(
  Schema.Struct({
    type: Schema.Literal('ref'),
    identity: Schema.String,
  }),
);

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

const schemaIssues = (
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
      for (const reference of referencesIn(version.shape)) {
        if (!identities.has(reference)) {
          issues.push({
            path: ['schemas', definitionIndex, 'versions', versionIndex],
            issue: `Dangling ESchema reference: ${reference}`,
          });
        }
      }
    });
  });
  return issues;
};

const tableIssues = (snapshot: TableSnapshot): readonly SnapshotIssue[] => {
  const issues = [...schemaIssues(snapshot.schemas)];
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

const issuesError = (issues: readonly SnapshotIssue[]): SnapshotDecodeError =>
  new SnapshotDecodeError(
    `Malformed snapshot: ${issues
      .map(({ path, issue }) => `${path.join('/')}: ${issue}`)
      .join('; ')}`,
  );

export function validateTableSnapshot(snapshot: TableSnapshot): TableSnapshot {
  const issues = tableIssues(snapshot);
  if (issues.length > 0) throw issuesError(issues);
  return snapshot;
}

export function parseTableSnapshot(
  input: unknown,
): Effect.Effect<TableSnapshot, SnapshotDecodeError> {
  return readEncoded(TableSnapshotESchema, input).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotDecodeError(
          `Malformed snapshot: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        ),
    ),
    Effect.flatMap((snapshot) => {
      const issues = tableIssues(snapshot);
      return issues.length === 0
        ? Effect.succeed(snapshot)
        : Effect.fail(issuesError(issues));
    }),
  );
}

export function serializeTableSnapshot(
  snapshot: TableSnapshot,
): Effect.Effect<unknown, SnapshotDecodeError> {
  return writeEncoded(TableSnapshotESchema, snapshot).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotDecodeError(`Malformed snapshot: ${cause.message}`, cause),
    ),
  );
}
