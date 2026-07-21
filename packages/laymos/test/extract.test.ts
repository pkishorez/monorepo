import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { extractFileGraph } from '../src/engine/1-extract/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('extractFileGraph', () => {
  it('analyzes configured source files and directories only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'laymos-extract-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, '.gitignore'), 'b.ts\n');
    await writeFile(
      join(directory, 'a.ts'),
      "import type { B } from './b.js';\nimport './ignored.js';\nexport type A = B;\n",
    );
    await writeFile(join(directory, 'b.ts'), 'export interface B {}\n');
    await writeFile(
      join(directory, 'ignored.ts'),
      'export const ignored = true;\n',
    );
    await writeFile(join(directory, 'notes.md'), '# Notes\n');
    await mkdir(join(directory, 'docs'));
    await writeFile(
      join(directory, 'docs', 'example.ts'),
      "import type { B } from '../b.js';\nexport type Example = B;\n",
    );

    const fileGraph = await Effect.runPromise(
      extractFileGraph(directory, ['a.ts', 'b.ts', 'docs']),
    );

    expect(Object.keys(fileGraph.files)).toEqual([
      'a.ts',
      'b.ts',
      'docs/example.ts',
    ]);
    expect(fileGraph.files['a.ts']?.imports).toEqual(['b.ts']);
    expect(fileGraph.files['docs/example.ts']?.imports).toEqual(['b.ts']);
  });

  it('keeps explicitly ignored files in the inventory without traversing them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'laymos-extract-'));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, 'generated'));
    await writeFile(
      join(directory, 'app.ts'),
      "import './generated/invalid.js';\nexport const app = true;\n",
    );
    await writeFile(
      join(directory, 'generated', 'invalid.ts'),
      'this is not valid TypeScript }}}',
    );

    const fileGraph = await Effect.runPromise(
      extractFileGraph(directory, ['.'], ['generated']),
    );

    expect(fileGraph.files).toEqual({
      'app.ts': { path: 'app.ts', imports: [] },
      'generated/invalid.ts': {
        path: 'generated/invalid.ts',
        imports: [],
      },
    });
  });
});
