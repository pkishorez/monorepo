import { fileURLToPath } from 'node:url';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect, Layer } from 'effect';
import { describe, expect, test } from 'vitest';

import {
  ConfigService,
  ConfigServiceLive,
} from '../../../../services/config/index.js';
import {
  Cruiser,
  CruiserLive,
} from '../../../../services/file-cruiser/index.js';
import { analyzeLayers } from '../index.js';

function scenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../../tests/fixtures/layers/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

function analyzeScenario(name: string) {
  return analyzeLayers(scenario(name)).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

describe('analyzeLayers orchestrator', () => {
  test('accepts a dependency permitted transitively across LayerGraphs', async () => {
    await expect(
      analyzeScenario('valid-transitive-dependency'),
    ).resolves.toMatchObject({ unassignedFiles: [], forbiddenImports: [] });
  });

  test('reports a forbidden sibling import', async () => {
    const result = await analyzeScenario('forbidden-sibling-import');

    expect(result.forbiddenImports).toEqual([
      {
        fromFile: 'src/feature-a/index.ts',
        fromLayer: 'feature-a',
        toFile: 'src/feature-b/index.ts',
        toLayer: 'feature-b',
      },
    ]);
  });

  test('reports an included unassigned file only once', async () => {
    await expect(analyzeScenario('unassigned-file')).resolves.toMatchObject({
      unassignedFiles: ['src/shared/log.ts'],
      forbiddenImports: [],
    });
  });

  test('removes ignored files and their imports from analysis', async () => {
    await expect(analyzeScenario('ignored-file')).resolves.toMatchObject({
      unassignedFiles: [],
      forbiddenImports: [],
    });
  });

  test('coordinates config and cruising through their service doors', async () => {
    const calls: unknown[][] = [];
    const configLayer = Layer.succeed(ConfigService)({
      read: () =>
        Effect.succeed({
          sourceRoots: ['source'],
          ignoredPaths: ['source/generated'],
          layers: { app: { paths: ['source/app'] } },
          modules: { 'source/app': { shared: false, nested: [] } },
          layerGraphs: {},
        }),
    });
    const cruiserLayer = Layer.succeed(Cruiser)({
      cruise: (baseDir, sourceRoots, ignoredPaths) => {
        calls.push([baseDir, sourceRoots, ignoredPaths]);
        return Effect.succeed(new Map([['source/app/main.ts', []]]));
      },
    });

    const result = await analyzeLayers('/project/laymos.config.json').pipe(
      Effect.provide(configLayer),
      Effect.provide(cruiserLayer),
      Effect.runPromise,
    );

    expect(result).toMatchObject({
      unassignedFiles: [],
      forbiddenImports: [],
    });
    expect(calls).toEqual([['/project', ['source'], ['source/generated']]]);
  });
});
