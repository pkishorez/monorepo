import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSnapshotCommand } from '../snapshot-command.js';

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
  const output: string[] = [];
  const exitCode = await runSnapshotCommand({
    cwd,
    update,
    write: (value) => output.push(value),
  });
  return { exitCode, output: output.join('\n') };
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
      output: expect.stringContaining('No approved snapshot found'),
    });
    await expect(run(cwd, true)).resolves.toMatchObject({
      exitCode: 0,
      output: expect.stringContaining('Approved snapshot written'),
    });
    expect(
      JSON.parse(
        await readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
      ),
    ).toEqual(snapshot());
    await expect(run(cwd, false)).resolves.toMatchObject({
      exitCode: 0,
      output: expect.stringContaining(
        'Database contract matches the approved snapshot',
      ),
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
    expect(drift.output).toContain('DATABASE CONTRACT CHANGED');
    expect(drift.output).toContain('✕ BREAKING');
    expect(drift.output).toContain('Snapshot was not updated');
    expect(
      JSON.parse(
        await readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
      ),
    ).toEqual(snapshot());

    await expect(run(cwd, true)).resolves.toMatchObject({
      exitCode: 0,
      output: expect.stringContaining('Approved snapshot updated'),
    });
    expect(
      JSON.parse(
        await readFile(join(cwd, 'std-toolkit.snapshot.json'), 'utf8'),
      ),
    ).toEqual(snapshot({ changed: true }));
  });
});
