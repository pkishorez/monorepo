import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { renderLintReport } from '../lint/index.js';
import { analyzeSnapshots } from '../shared/schema-snapshots/index.js';
import { schemaSnapshotFixture } from './schema-snapshot-fixtures.js';

function analyze(root: string) {
  return analyzeSnapshots(root).pipe(
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

describe('lint command', () => {
  it('renders clean schema roots with latest version, per-version status, and success', async () => {
    const root = schemaSnapshotFixture('clean');

    const output = renderLintReport(await analyze(root));

    expect(output.exitCode).toBe(0);
    expect(output.text).toContain('Schema: user');
    expect(output.text).toContain('Latest: v2');
    expect(output.text).toContain('v1 approved');
    expect(output.text).toContain('v2 approved');
    expect(output.text).toContain('Snapshot lint passed');
  });

  it('renders every issue, modified version diffs, and failure exit code', async () => {
    const root = schemaSnapshotFixture('modified');

    const output = renderLintReport(await analyze(root));

    expect(output.exitCode).toBe(1);
    expect(output.text).toContain('Schema: user');
    expect(output.text).toContain('Latest: v2');
    expect(output.text).toContain(
      'ModifiedVersion v2: Version v2 differs from its approved snapshot',
    );
    expect(output.text).toContain('--- user/__snapshots__/v2.ts.snap');
    expect(output.text).toContain('+++ user/versions/v2.ts');
    expect(output.text).toContain(
      '-export const v2 = v1.evolve("v2", {}, (value) => value);',
    );
    expect(output.text).toContain(
      '+export const v2 = v1.evolve("v2", { name: Schema.String }, (value) => value);',
    );
    expect(output.text).toContain('Snapshot lint failed: 1 issue(s).');
  });
});
