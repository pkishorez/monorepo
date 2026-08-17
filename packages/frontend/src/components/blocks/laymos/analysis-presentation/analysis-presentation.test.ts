import type { ArchitectureAnalysis } from 'laymos';
import { describe, expect, test } from 'vitest';

import { buildPresentationModel } from './analysis-presentation';

const analysis: ArchitectureAnalysis = {
  config: {
    sourceRoots: ['src'],
    ignoredPaths: [],
    layers: {
      app: {
        paths: ['src/app'],
        description: 'Application',
        modules: { 'src/app': { shared: false, exposed: true } },
        moduleGraphs: {},
      },
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
        exposed: true,
        shape: 'directory',
        observedKind: 'isolated',
      },
    ],
    graphs: [],
    membership: new Map([
      ['src/app/index.ts', 'src/app'],
      ['src/app/public/index.ts', 'src/app'],
    ]),
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
      shared: false,
      exposed: true,
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
            permitted: true,
          },
        ],
      },
    });

    expect(model.moduleDependencies).toEqual([
      {
        fromModuleId: 'src/app',
        toModuleId: 'src/app',
        toEntryPointId: 'src/app/public',
        permitted: true,
      },
    ]);
  });
});
