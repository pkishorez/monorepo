import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  analyzeSnapshots,
  formatUnifiedDiff,
  type SnapshotReport,
} from '../shared/schema-snapshots/index.js';
import { schemaSnapshotFixture } from './schema-snapshot-fixtures.js';

function analyze(root: string) {
  return analyzeSnapshots(root).pipe(
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

function issueTags(report: SnapshotReport) {
  return report.issues.map((issue) => issue._tag);
}

describe('ESchema', () => {
  describe('CLI', () => {
    describe('Snapshot analyzer', () => {
      it('accepts an approved schema root with contiguous versions and matching snapshots', async () => {
        const root = schemaSnapshotFixture('clean');
        const schemaRoot = join(root, 'user');

        const report = await analyze(root);

        expect(report).toEqual({
          root,
          schemas: [
            {
              path: schemaRoot,
              relativePath: 'user',
              latestVersion: 'v2',
              versions: [
                {
                  version: 'v1',
                  versionFile: join(schemaRoot, 'versions', 'v1.ts'),
                  snapshotFile: join(schemaRoot, '__snapshots__', 'v1.ts.snap'),
                  status: 'approved',
                },
                {
                  version: 'v2',
                  versionFile: join(schemaRoot, 'versions', 'v2.ts'),
                  snapshotFile: join(schemaRoot, '__snapshots__', 'v2.ts.snap'),
                  status: 'approved',
                },
              ],
              issues: [],
            },
          ],
          issues: [],
        });
      });

      it('reports new, modified, missing snapshot, and hash mismatch version states', async () => {
        const root = schemaSnapshotFixture('version-states');

        const report = await analyze(root);
        const schema = report.schemas[0];

        expect(issueTags(report)).toEqual([
          'NewVersion',
          'ModifiedVersion',
          'MissingSnapshotFile',
          'SnapshotHashMismatch',
        ]);
        expect(
          schema?.versions.map((version) => [version.version, version.status]),
        ).toEqual([
          ['v1', 'approved'],
          ['v2', 'new'],
          ['v3', 'modified'],
          ['v4', 'missing-file'],
          ['v5', 'hash-mismatch'],
        ]);
        expect(
          report.issues.find((issue) => issue._tag === 'ModifiedVersion'),
        ).toMatchObject({
          version: 'v3',
          expected:
            'export const v3 = v2.evolve("v3", { name: Schema.String }, (value) => value);\n',
          actual: 'export const v3 = v2.evolve("v3", {}, (value) => value);\n',
        });
      });

      it('discovers nested schema roots and reports invalid structure', async () => {
        const root = schemaSnapshotFixture('invalid-structure');

        const report = await analyze(root);

        expect(report.schemas.map((schema) => schema.relativePath)).toEqual([
          'domain/billing/invoice',
        ]);
        expect(issueTags(report)).toEqual([
          'InvalidVersionFilename',
          'NonContiguousVersions',
          'MissingVersionExport',
        ]);
        expect(report.schemas[0]?.latestVersion).toBe('v1');
      });

      it('reports missing schema files, missing versions directories, invalid manifests, and non-latest schema builds', async () => {
        const root = schemaSnapshotFixture('missing-pieces');

        const report = await analyze(root);

        expect(issueTags(report)).toEqual([
          'InvalidSnapshotsJson',
          'NewVersion',
          'MissingSchemaFile',
          'NewVersion',
          'MissingVersionsDirectory',
          'SchemaDoesNotBuildLatest',
        ]);
      });

      it('reports manifest and snapshot entries for deleted version files', async () => {
        const root = schemaSnapshotFixture('deleted-version');

        const report = await analyze(root);

        expect(issueTags(report)).toEqual(['MissingVersionFile']);
      });

      it('formats a unified diff for modified version rendering', () => {
        expect(
          formatUnifiedDiff(
            '__snapshots__/v1.ts.snap',
            'export const v1 = old;\n',
            'versions/v1.ts',
            'export const v1 = next;\n',
          ),
        ).toBe(
          [
            '--- __snapshots__/v1.ts.snap',
            '+++ versions/v1.ts',
            '@@ -1,1 +1,1 @@',
            '-export const v1 = old;',
            '+export const v1 = next;',
            '',
          ].join('\n'),
        );
      });
    });
  });
});
