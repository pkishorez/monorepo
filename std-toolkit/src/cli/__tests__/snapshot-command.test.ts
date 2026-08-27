import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import * as NodeServices from '@effect/platform-node/NodeServices';
import {
  renderSnapshotResult,
  type SnapshotCommandResult,
  updateSnapshot,
  verifySnapshot,
} from '../snapshot/index.js';

const directories: string[] = [];

function snapshot(decoded: unknown = {}): unknown {
  return {
    _v: 'v1',
    kind: 'eschema',
    root: 'Item',
    schemas: [
      {
        identity: 'Item',
        kind: 'struct',
        idField: null,
        versions: [
          {
            version: 'v1',
            encoded: {},
            decoded,
            transformations: [],
            unverifiable: [],
          },
        ],
      },
    ],
  };
}

async function fixture(current: unknown): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'std-toolkit-snapshot-'));
  directories.push(cwd);
  await writeFile(
    join(cwd, 'std-toolkit.snapshot.ts'),
    `export default ${JSON.stringify(current)};\n`,
  );
  return cwd;
}

async function run(
  cwd: string,
  update: boolean,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const result: SnapshotCommandResult = update
    ? await Effect.runPromise(
        updateSnapshot(cwd).pipe(Effect.provide(NodeServices.layer)),
      )
    : await Effect.runPromise(
        verifySnapshot(cwd).pipe(Effect.provide(NodeServices.layer)),
      );
  return renderSnapshotResult(result);
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('std-toolkit snapshot command', () => {
  it('creates and verifies one approved snapshot file', async () => {
    const cwd = await fixture(snapshot());

    await expect(run(cwd, false)).resolves.toMatchObject({
      exitCode: 1,
      output: expect.stringContaining('FAIL  No approved snapshot found'),
    });
    await expect(run(cwd, true)).resolves.toMatchObject({
      exitCode: 0,
      output: 'UPDATED  std-toolkit.snapshot.json',
    });
    expect(
      JSON.parse(
        await readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
      ),
    ).toEqual(snapshot());
    await expect(run(cwd, false)).resolves.toMatchObject({
      exitCode: 0,
      output: 'PASS  Snapshot matches',
    });
  });

  it('reports drift and updates only when requested', async () => {
    const cwd = await fixture(snapshot());
    await run(cwd, true);
    await writeFile(
      join(cwd, 'std-toolkit.snapshot.ts'),
      `export default ${JSON.stringify(snapshot({ changed: true }))};\n`,
    );

    const drift = await run(cwd, false);
    expect(drift).toMatchObject({ exitCode: 1 });
    expect(drift.output).toContain('FAIL  1 snapshot change needs approval');
    expect(drift.output).toContain('BREAKING');
    expect(drift.output).toContain('std-toolkit snapshot update');
    expect(drift.output).not.toContain('DATABASE CONTRACT\n');
    expect(
      JSON.parse(
        await readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
      ),
    ).toEqual(snapshot());

    await expect(run(cwd, true)).resolves.toMatchObject({
      exitCode: 0,
      output: expect.stringContaining('UPDATED  1 snapshot change'),
    });
    expect(
      JSON.parse(
        await readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
      ),
    ).toEqual(snapshot({ changed: true }));
  });

  it('does not rewrite an unchanged approved snapshot', async () => {
    const cwd = await fixture(snapshot());
    await run(cwd, true);
    await expect(run(cwd, true)).resolves.toEqual({
      exitCode: 0,
      output: 'ALREADY UP TO DATE  No snapshot changes',
    });
  });

  it('refuses to overwrite an unreadable baseline', async () => {
    const cwd = await fixture(snapshot());
    const baseline = join(cwd, 'std-toolkit.snapshot.json');
    await writeFile(baseline, '{invalid');

    await expect(run(cwd, true)).rejects.toThrow(
      'Snapshot baseline is not valid JSON',
    );
    await expect(readFile(baseline, 'utf8')).resolves.toBe('{invalid');
  });

  it('refuses to write when the contract entry fails to import', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'std-toolkit-snapshot-'));
    directories.push(cwd);
    await writeFile(
      join(cwd, 'std-toolkit.snapshot.ts'),
      'this is not valid TypeScript at all {{{\n',
    );

    await expect(run(cwd, true)).rejects.toThrow();
    await expect(
      readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
    ).rejects.toThrow();
  });

  it('refuses to write when the contract entry has no default export', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'std-toolkit-snapshot-'));
    directories.push(cwd);
    await writeFile(
      join(cwd, 'std-toolkit.snapshot.ts'),
      'export const notTheDefault = 1;\n',
    );

    await expect(run(cwd, true)).rejects.toThrow();
    await expect(
      readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
    ).rejects.toThrow();
  });
});
