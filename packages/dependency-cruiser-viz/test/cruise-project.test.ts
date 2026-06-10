import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { cruiseProject } from '../src/node.js';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('cruiseProject loads config and resolves rootDir relative to baseDir', async () => {
  const result = await cruiseProject(packageDir);

  expect(result.config.rootDir).toBeTruthy();
  expect(result.summary.coveredFiles.length).toBeGreaterThan(0);
});

test('cruiseProject does not rely on process.cwd()', async () => {
  const originalCwd = process.cwd();
  process.chdir(resolve(packageDir, 'src'));
  try {
    const result = await cruiseProject(packageDir);
    expect(result.summary.coveredFiles.length).toBeGreaterThan(0);
  } finally {
    process.chdir(originalCwd);
  }
});
