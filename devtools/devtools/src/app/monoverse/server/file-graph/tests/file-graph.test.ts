import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { diskSnapshot, openSnapshot } from '../../snapshot/index.js';
import { withFixture } from '../../tests/git-fixture.js';
import { buildFileGraph } from '../index.js';

let root: string;
const files: Record<string, string> = {
  'pkg/src/index.ts': "export * from './app/index.js';\n",
  'pkg/src/app/index.ts': "export { run } from './run.js';\n",
  'pkg/src/app/run.ts':
    "import { helper } from '../util';\nimport 'effect';\nimport { x } from '../../scripts/x.js';\nexport const run = helper;\n",
  'pkg/src/util.ts':
    "import type { Run } from './types.js';\nexport const helper = 1;\n",
  'pkg/src/types.ts': 'export type Run = 1;\n',
  'pkg/src/app/tests/run.test.ts': "import { run } from '../run.js';\n",
  'pkg/scripts/x.ts': "import '../src/index.js';\nexport const x = 1;\n",
  'pkg/package.json':
    '{"name":"pkg","imports":{"#app/*":"./src/app/*.ts","#types":{"types":"./src/types.ts"}}}',
  'pkg/tsconfig.json':
    '{\n  // Comments and trailing commas, as tsconfig allows.\n  "extends": "./tsconfig.base.json",\n}\n',
  'pkg/tsconfig.base.json':
    '{"compilerOptions":{"paths":{"@pkg/*":["./src/*"],"~util":["./src/util.ts"]}}}',
  'pkg/src/aliased.ts':
    "import '#app/run';\nimport '#types';\nimport '@pkg/util';\nimport '~util';\nimport '@other/thing';\nimport 'node:fs';\n",
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'monoverse-graph-'));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('the file import graph', () => {
  test('links each source file to what it imports inside the Source roots', async () => {
    const graph = await Effect.runPromise(
      buildFileGraph(diskSnapshot(root, root), Object.keys(files), ['pkg/src']),
    );
    expect(graph).toEqual([
      ['pkg/src/aliased.ts', 'pkg/src/app/run.ts'],
      ['pkg/src/aliased.ts', 'pkg/src/types.ts'],
      ['pkg/src/aliased.ts', 'pkg/src/util.ts'],
      ['pkg/src/app/index.ts', 'pkg/src/app/run.ts'],
      ['pkg/src/app/run.ts', 'pkg/src/util.ts'],
      ['pkg/src/index.ts', 'pkg/src/app/index.ts'],
      ['pkg/src/util.ts', 'pkg/src/types.ts'],
    ]);
  });

  test('takes in every Source root', async () => {
    const graph = await Effect.runPromise(
      buildFileGraph(diskSnapshot(root, root), Object.keys(files), [
        'pkg/src',
        'pkg/scripts',
      ]),
    );
    expect(graph).toContainEqual(['pkg/src/app/run.ts', 'pkg/scripts/x.ts']);
    expect(graph).toContainEqual(['pkg/scripts/x.ts', 'pkg/src/index.ts']);
  });
});

describe('the file import graph at a branch read from git', () => {
  test("resolves against the commit's own files, not the disk's", () =>
    withFixture(async ({ repo }) => {
      const snapshot = await Effect.runPromise(openSnapshot(repo, 'feature'));
      const files = await snapshot.list('packages/core');
      const graph = await Effect.runPromise(
        buildFileGraph(snapshot, files, ['packages/core/src']),
      );
      expect(graph).toEqual([
        ['packages/core/src/feature.ts', 'packages/core/src/util.ts'],
        ['packages/core/src/index.ts', 'packages/core/src/feature.ts'],
        ['packages/core/src/index.ts', 'packages/core/src/util.ts'],
      ]);
    }));
});
