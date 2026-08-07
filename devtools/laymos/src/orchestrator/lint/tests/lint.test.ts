import { Effect, Layer } from 'effect';
import { describe, expect, test } from 'vitest';

import { ConfigService } from '../../../services/config/index.js';
import { Cruiser } from '../../../services/file-cruiser/index.js';
import { lint } from '../index.js';

describe('lint orchestrator', () => {
  test('composes focused lint over one project analysis', async () => {
    const calls: unknown[][] = [];
    const configLayer = Layer.succeed(ConfigService)({
      read: () =>
        Effect.succeed({
          sourceRoots: ['source'],
          ignoredPaths: [],
          layers: { app: { paths: ['source/app'] } },
          modules: {
            'source/app': { shared: false, nested: [] },
          },
          layerGraphs: {},
        }),
    });
    const cruiserLayer = Layer.succeed(Cruiser)({
      cruise: (baseDir, sourceRoots, ignoredPaths) => {
        calls.push([baseDir, sourceRoots, ignoredPaths]);
        return Effect.succeed(new Map([['source/app/index.ts', []]]));
      },
    });

    const result = await lint('/project/laymos.config.json').pipe(
      Effect.provide(configLayer),
      Effect.provide(cruiserLayer),
      Effect.runPromise,
    );

    expect(result).toMatchObject({
      layers: { unassignedFiles: [], forbiddenImports: [] },
      modules: { violations: [] },
    });
    expect(result.project.fileGraph).toEqual(
      new Map([['source/app/index.ts', []]]),
    );
    expect(calls).toEqual([['/project', ['source'], []]]);
  });
});
