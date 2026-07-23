import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/load-config/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadConfig', () => {
  it.each([
    `export default {
  sourceRoots: ['src'],
  graphs: [{ kind: 'layer-graph' }],
};`,
    `export default {
  sourceRoots: [42],
  graphs: [],
};`,
    `export default {
  sourceRoots: ['src'],
  graphs: [],
  modules: [{ kind: 'module', path: 42, description: 'Invalid module' }],
};`,
  ])(
    'returns ConfigValidationError for malformed nested values',
    async (source) => {
      const projectDir = await mkdtemp(join(tmpdir(), 'laymos-config-'));
      temporaryDirectories.push(projectDir);
      await writeFile(join(projectDir, 'laymos.config.ts'), source);

      await expect(
        Effect.runPromise(loadConfig({ projectDir })),
      ).rejects.toMatchObject({
        _tag: 'ConfigValidationError',
        issues: [
          'Config must default-export a value created with defineConfig()',
        ],
      });
    },
  );
});
