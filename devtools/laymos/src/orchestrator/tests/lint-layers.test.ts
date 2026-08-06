import { fileURLToPath } from 'node:url';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect, Layer } from 'effect';
import { describe, expect, test } from 'vitest';

import {
  ConfigService,
  ConfigServiceLive,
} from '../../services/config/index.js';
import { Cruiser, CruiserLive } from '../../services/file-cruiser/index.js';
import { lintLayers } from '../lint-layers.js';

function scenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../tests/fixtures/layers/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

function lintScenario(name: string) {
  return lintLayers(scenario(name)).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

describe('lintLayers orchestrator', () => {
  test('accepts a dependency permitted transitively across LayerGraphs', async () => {
    await expect(lintScenario('valid-transitive-dependency')).resolves.toEqual({
      unassignedFiles: [],
      forbiddenImports: [],
    });
  });

  test('reports a forbidden sibling import', async () => {
    const result = await lintScenario('forbidden-sibling-import');

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
    await expect(lintScenario('unassigned-file')).resolves.toEqual({
      unassignedFiles: ['src/shared/log.ts'],
      forbiddenImports: [],
    });
  });

  test('removes ignored files and their imports from analysis', async () => {
    await expect(lintScenario('ignored-file')).resolves.toEqual({
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
          layerGraphs: {},
        }),
    });
    const cruiserLayer = Layer.succeed(Cruiser)({
      cruise: (baseDir, sourceRoots, ignoredPaths) => {
        calls.push([baseDir, sourceRoots, ignoredPaths]);
        return Effect.succeed(new Map([['source/app/main.ts', []]]));
      },
    });

    const result = await lintLayers('/project/laymos.config.json').pipe(
      Effect.provide(configLayer),
      Effect.provide(cruiserLayer),
      Effect.runPromise,
    );

    expect(result).toEqual({ unassignedFiles: [], forbiddenImports: [] });
    expect(calls).toEqual([['/project', ['source'], ['source/generated']]]);
  });
});
