import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { analyzeDeps, analyzeFiles } from '../src/node.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureProject = resolve(testDir, 'fixtures/deps-project');
const minimalProject = resolve(testDir, 'fixtures/minimal-project');

test('analyzeDeps reports boundary edges and module insights', async () => {
  const analysis = await analyzeDeps(fixtureProject, 'src/feature');

  expect(analysis.incoming).toEqual([
    {
      counterpart: 'src',
      count: 2,
      edges: [
        {
          fromFile: 'src/consumer/a.ts',
          toFile: 'src/feature/index.ts',
        },
        {
          fromFile: 'src/consumer/b.ts',
          toFile: 'src/feature/internal.ts',
        },
      ],
    },
  ]);
  expect(analysis.outgoing).toEqual([
    {
      counterpart: 'src',
      count: 2,
      edges: [
        {
          fromFile: 'src/feature/index.ts',
          toFile: 'src/core/util.ts',
        },
        {
          fromFile: 'src/feature/internal.ts',
          toFile: 'src/core/util.ts',
        },
      ],
    },
  ]);
  expect(analysis.insights.entryPoint).toEqual({
    verdict: 'deep-imports',
    entryFile: 'src/feature/index.ts',
    offenders: ['src/feature/internal.ts'],
  });
  expect(analysis.insights.suggestedRules).toEqual({
    onlyImportedBy: ['src/consumer'],
    onlyImports: ['src/core'],
  });
  expect(analysis.insights.config).toEqual({
    declaredModule: {
      path: 'src/feature',
      name: 'feature',
      layer: 'feature',
    },
    layer: 'feature',
  });
});

test('analyzeDeps works with a minimal config without rules or modules', async () => {
  const analysis = await analyzeDeps(minimalProject, 'src/target');

  expect(analysis.incoming).toEqual([
    {
      counterpart: 'src',
      count: 1,
      edges: [
        {
          fromFile: 'src/consumer.ts',
          toFile: 'src/target/index.ts',
        },
      ],
    },
  ]);
  expect(analysis.outgoing).toEqual([
    {
      counterpart: 'src',
      count: 1,
      edges: [
        {
          fromFile: 'src/target/index.ts',
          toFile: 'src/util.ts',
        },
      ],
    },
  ]);
  expect(analysis.insights.entryPoint).toEqual({
    verdict: 'single-index',
    entryFile: 'src/target/index.ts',
    offenders: [],
  });
  expect(analysis.insights.config).toEqual({
    declaredModule: null,
    layer: null,
  });
});

test('analyzeFiles reports inventory problem groups and covered files', async () => {
  const analysis = await analyzeFiles(fixtureProject);

  expect(analysis.stats).toEqual({
    totalFiles: 7,
    layerCoveredFiles: 5,
    moduleCoveredFiles: 3,
    orphanedFiles: 1,
    coveredByLayerButNoModuleFiles: 2,
    ignoredFiles: 1,
  });
  expect(analysis.problems).toEqual({
    orphaned: ['src/orphan.ts'],
    moduleGaps: ['src/consumer/a.ts', 'src/consumer/b.ts'],
    ignored: ['src/ignored.ts'],
  });
  expect(analysis.covered.find((layer) => layer.layer === 'feature')).toEqual({
    layer: 'feature',
    files: ['src/feature/index.ts', 'src/feature/internal.ts'],
    modules: [
      {
        module: 'feature',
        files: ['src/feature/index.ts', 'src/feature/internal.ts'],
      },
    ],
    filesWithoutModule: [],
  });
});
