import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { approveVersionSnapshot, runApprovalWith } from '../approve/index.js';
import {
  analyzeSnapshots,
  hashSnapshotContent,
} from '../shared/schema-snapshots/index.js';
import { copySchemaSnapshotFixture } from './schema-snapshot-fixtures.js';

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

async function analyze(root: string) {
  return analyzeSnapshots(root).pipe(
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

async function runApprove(
  root: string,
  input: string,
  args: readonly string[] = [],
) {
  const answers = input.split('\n');
  const output: string[] = [];
  let index = 0;

  await runApprovalWith({
    root,
    force: args.includes('--force'),
    readApprovalText: (label) =>
      Effect.sync(() => {
        output.push(`Approve ${label}? [approve/ignore]\n`);
        return answers[index++] ?? '';
      }),
    display: (line) =>
      Effect.sync(() => {
        output.push(`${line}\n`);
      }),
  }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);

  return output.join('');
}

describe('ESchema', () => {
  describe('CLI', () => {
    describe('Approve', () => {
      it('approves a new latest version by creating its snapshot and manifest hash', async () => {
        const root = copySchemaSnapshotFixture(
          'new-version',
          'eschema-approval-',
        );
        const schemaRoot = join(root, 'user');
        const v1 = readText(join(schemaRoot, 'versions', 'v1.ts'));

        await approveVersionSnapshot({ schemaRoot, version: 'v1' }).pipe(
          Effect.provide(NodeServices.layer),
          Effect.runPromise,
        );

        expect(readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap'))).toBe(
          v1,
        );
        expect(
          JSON.parse(readText(join(schemaRoot, 'snapshots.json'))),
        ).toEqual({
          v1: hashSnapshotContent(v1),
        });
        expect(existsSync(join(schemaRoot, 'index.ts'))).toBe(false);
        expect((await analyze(root)).issues).toEqual([]);
      });

      it('ignores a new version without writing snapshot files', async () => {
        const root = copySchemaSnapshotFixture(
          'new-version',
          'eschema-approval-',
        );
        const schemaRoot = join(root, 'user');

        await runApprove(root, 'ignore\n');

        expect(
          existsSync(join(schemaRoot, '__snapshots__', 'v1.ts.snap')),
        ).toBe(false);
        expect(existsSync(join(schemaRoot, 'snapshots.json'))).toBe(false);
        expect((await analyze(root)).issues.map((issue) => issue._tag)).toEqual(
          ['NewVersion'],
        );
      });

      it('approves a new version from the interactive command', async () => {
        const root = copySchemaSnapshotFixture(
          'new-version',
          'eschema-approval-',
        );
        const schemaRoot = join(root, 'user');
        const v1 = readText(join(schemaRoot, 'versions', 'v1.ts'));

        await runApprove(root, 'a\n');

        expect(readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap'))).toBe(
          v1,
        );
        expect(
          JSON.parse(readText(join(schemaRoot, 'snapshots.json'))),
        ).toEqual({
          v1: hashSnapshotContent(v1),
        });
        expect((await analyze(root)).issues).toEqual([]);
      });

      it('shows a diff and approves a modified latest version', async () => {
        const root = copySchemaSnapshotFixture('modified', 'eschema-approval-');
        const schemaRoot = join(root, 'user');
        const updatedV2 = readText(join(schemaRoot, 'versions', 'v2.ts'));

        const output = await runApprove(root, 'approve\n');

        expect(output).toContain('ModifiedVersion v2');
        expect(output).toContain('--- user/__snapshots__/v2.ts.snap');
        expect(output).toContain('+++ user/versions/v2.ts');
        expect(output).toContain(
          '+export const v2 = v1.evolve("v2", { name: Schema.String }, (value) => value);',
        );
        expect(readText(join(schemaRoot, '__snapshots__', 'v2.ts.snap'))).toBe(
          updatedV2,
        );
        expect(
          JSON.parse(readText(join(schemaRoot, 'snapshots.json'))).v2,
        ).toBe(hashSnapshotContent(updatedV2));
        expect((await analyze(root)).issues).toEqual([]);
      });

      it('reports a modified non-latest version without offering approval', async () => {
        const root = copySchemaSnapshotFixture('clean', 'eschema-approval-');
        const schemaRoot = join(root, 'user');
        const v1 = readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap'));
        const updatedV1 =
          'export const v1 = ESchema.make({ name: Schema.String });\n';
        writeFileSync(join(schemaRoot, 'versions', 'v1.ts'), updatedV1);

        const output = await runApprove(root, 'approve\n');

        expect(output).toContain('ModifiedVersion v1');
        expect(output).toContain('Approval blocked: use --force');
        expect(output).toContain('--- user/__snapshots__/v1.ts.snap');
        expect(output).not.toContain('Approve user v1?');
        expect(readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap'))).toBe(
          v1,
        );
        expect((await analyze(root)).issues.map((issue) => issue._tag)).toEqual(
          ['ModifiedVersion'],
        );
      });

      it('approves a modified non-latest version when forced', async () => {
        const root = copySchemaSnapshotFixture('clean', 'eschema-approval-');
        const schemaRoot = join(root, 'user');
        const updatedV1 =
          'export const v1 = ESchema.make({ name: Schema.String });\n';
        writeFileSync(join(schemaRoot, 'versions', 'v1.ts'), updatedV1);

        const output = await runApprove(root, 'a\n', ['--force']);

        expect(output).toContain('ModifiedVersion v1');
        expect(output).toContain('Approve user v1?');
        expect(output).not.toContain('Approval blocked: use --force');
        expect(readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap'))).toBe(
          updatedV1,
        );
        expect(
          JSON.parse(readText(join(schemaRoot, 'snapshots.json'))).v1,
        ).toBe(hashSnapshotContent(updatedV1));
        expect((await analyze(root)).issues).toEqual([]);
      });

      it('reports deleted version references without writing approvals', async () => {
        const root = copySchemaSnapshotFixture(
          'deleted-version',
          'eschema-approval-',
        );
        const schemaRoot = join(root, 'user');
        const deletedV2 = readText(
          join(schemaRoot, '__snapshots__', 'v2.ts.snap'),
        );

        const output = await runApprove(root, 'approve\n', ['--force']);

        expect(output).toContain('MissingVersionFile v2');
        expect(output).not.toContain('Approve user v2?');
        expect(readText(join(schemaRoot, '__snapshots__', 'v2.ts.snap'))).toBe(
          deletedV2,
        );
        expect(
          JSON.parse(readText(join(schemaRoot, 'snapshots.json'))).v2,
        ).toBe(hashSnapshotContent(deletedV2));
      });

      it('re-prompts after an invalid answer for the same version', async () => {
        const root = copySchemaSnapshotFixture(
          'new-version',
          'eschema-approval-',
        );
        const schemaRoot = join(root, 'user');
        const v1 = readText(join(schemaRoot, 'versions', 'v1.ts'));

        const output = await runApprove(root, 'wat\na\n');

        expect(output).toContain('Please answer approve, a, ignore, or i.');
        expect(output.match(/Approve user v1\?/g)).toHaveLength(2);
        expect(readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap'))).toBe(
          v1,
        );
        expect((await analyze(root)).issues).toEqual([]);
      });
    });
  });
});
