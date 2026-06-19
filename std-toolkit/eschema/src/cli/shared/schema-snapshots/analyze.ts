import { Effect, FileSystem } from 'effect';
import { readSchemaCollection } from './read-schema-collection.js';
import {
  checkLatestSchemaBuild,
  checkStructure,
  describeSnapshotState,
  describeVersionFiles,
  findDeletedVersionReferences,
} from './rules/index.js';
import type {
  SchemaRootSource,
  SchemaSnapshotReport,
  SnapshotAnalysisError,
  SnapshotReport,
} from './model.js';

export function analyzeSnapshots(
  root: string,
): Effect.Effect<SnapshotReport, SnapshotAnalysisError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const collection = yield* readSchemaCollection(root);
    const schemas = collection.schemas.map(analyzeSchemaRoot);

    return {
      root: collection.root,
      schemas,
      issues: schemas.flatMap((schema) => schema.issues),
    };
  });
}

function analyzeSchemaRoot(schema: SchemaRootSource): SchemaSnapshotReport {
  const versionFiles = describeVersionFiles(schema);
  const snapshotState = describeSnapshotState(
    schema,
    versionFiles.validVersionFiles,
  );
  const issues = [
    ...checkStructure(schema),
    ...versionFiles.issues,
    ...checkLatestSchemaBuild(schema, versionFiles.latestVersionName),
    ...snapshotState.issues,
    ...findDeletedVersionReferences(schema, versionFiles.validVersionFiles),
  ];

  return {
    path: schema.path,
    relativePath: schema.relativePath,
    latestVersion: versionFiles.latestVersionName,
    versions: snapshotState.versions,
    issues,
  };
}
