import { tmpdir } from 'node:os';
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

test('cruiseProject is independent of the host process cwd', async () => {
  // dependency-cruiser's module resolver keys off the real process cwd, so a
  // caller running from an unrelated directory (e.g. the DevTools server) would
  // otherwise fail to resolve imports and silently drop edges. cruiseProject
  // chdirs into the cruised package, so the result must be identical from any
  // cwd — and the caller's cwd must be restored afterwards.
  const fromPackage = await cruiseProject(packageDir);

  const originalCwd = process.cwd();
  process.chdir(tmpdir());
  let fromElsewhere: Awaited<ReturnType<typeof cruiseProject>>;
  try {
    fromElsewhere = await cruiseProject(packageDir);
  } finally {
    process.chdir(originalCwd);
  }

  // cwd restored, and resolution-dependent results match across cwds.
  expect(process.cwd()).toBe(originalCwd);
  expect(fromElsewhere.summary.coveredFiles).toEqual(
    fromPackage.summary.coveredFiles,
  );
  expect(fromElsewhere.summary.violations).toEqual(
    fromPackage.summary.violations,
  );
  expect(fromElsewhere.summary.moduleEdges).toEqual(
    fromPackage.summary.moduleEdges,
  );
});
