import { issue } from '../issue.js';
import type { SchemaRootSource, SnapshotIssue } from '../model.js';

export function checkLatestSchemaBuild(
  schema: SchemaRootSource,
  latestVersionName: string | null,
): readonly SnapshotIssue[] {
  if (latestVersionName === null || schema.schemaFileContent === null) {
    return [];
  }

  if (schemaBuildsLatest(schema.schemaFileContent, latestVersionName)) {
    return [];
  }

  return [
    issue(
      'SchemaDoesNotBuildLatest',
      schema.path,
      { path: schema.schemaFile, version: latestVersionName },
      `schema.ts must export ${latestVersionName}.build()`,
    ),
  ];
}

function schemaBuildsLatest(content: string, latestVersion: string): boolean {
  return new RegExp(
    `export\\s+const\\s+schema\\s*=\\s*${latestVersion}\\.build\\(\\)`,
  ).test(content);
}
