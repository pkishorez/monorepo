import type { ArchitectureAnalysis } from 'laymos';
import { describe, expect, test } from 'vitest';

import { buildPresentationModel } from './presentation-model';

const analysis: ArchitectureAnalysis = {
  config: {
    sourceRoots: ['src'],
    ignoredPaths: [],
    layers: {
      app: { paths: ['src/app'], description: 'Application' },
    },
    modules: {
      'src/app': { shared: false, nested: ['public'] },
    },
    layerGraphs: {
      architecture: { rules: { app: [] } },
    },
  },
  layerAnalysis: {
    membership: new Map([
      ['src/app/index.ts', 'app'],
      ['src/app/public/index.ts', 'app'],
    ]),
    allowedDependencies: new Map([['app', new Set()]]),
    unassignedFiles: [],
    forbiddenImports: [],
    layersWithoutModules: [],
  },
  moduleAnalysis: {
    modules: [
      {
        path: 'src/app',
        layer: 'app',
        shared: false,
        nested: ['public'],
        kind: 'isolated',
      },
    ],
    membership: new Map([
      ['src/app/index.ts', 'src/app'],
      ['src/app/public/index.ts', 'src/app'],
    ]),
    unexposedModules: new Set(),
    entryPoints: new Set(['src/app/index.ts', 'src/app/public/index.ts']),
    dependencies: [],
    violations: [],
  },
};

describe('buildPresentationModel', () => {
  test('derives component data from Architecture Analysis', () => {
    const model = buildPresentationModel(analysis);

    expect(model.layers).toEqual([
      {
        id: 'app',
        description: 'Application',
        scopes: [{ path: 'src/app', fileCount: 2 }],
      },
    ]);
    expect(model.modules[0]).toMatchObject({
      id: 'src/app',
      layerId: 'app',
      nested: [{ id: 'src/app/public', path: 'public' }],
    });
  });

  test('maps entry-point files to graph node ids', () => {
    const model = buildPresentationModel({
      ...analysis,
      moduleAnalysis: {
        ...analysis.moduleAnalysis,
        dependencies: [
          {
            fromModule: 'src/app',
            toModule: 'src/app',
            toEntryPoint: 'src/app/public/index.ts',
          },
        ],
      },
    });

    expect(model.moduleDependencies).toEqual([
      {
        fromModuleId: 'src/app',
        toModuleId: 'src/app',
        toEntryPointId: 'src/app/public',
      },
    ]);
  });
});
