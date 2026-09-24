import type { ArchitectureAnalysis } from 'laymos';
import { describe, expect, test } from 'vitest';

import {
  buildPresentationModel,
  changedArchitecture,
} from './analysis-presentation';

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

describe('changedArchitecture', () => {
  const layers = [
    { id: 'app', scopes: [] },
    { id: 'lib', scopes: [] },
    { id: 'idle', scopes: [] },
  ];
  const layerGraphs = [
    { id: 'main', rules: [{ fromLayerId: 'app', toLayerIds: ['lib'] }] },
    { id: 'aside', rules: [{ fromLayerId: 'idle', toLayerIds: [] }] },
  ];
  const unchangedModules = [
    {
      id: 'src/app',
      layerId: 'app',
      shared: false,
      exposed: true,
      kind: 'root' as const,
    },
    {
      id: 'src/lib/a',
      layerId: 'lib',
      shared: true,
      exposed: false,
      kind: 'regular' as const,
    },
    {
      id: 'src/lib/b',
      layerId: 'lib',
      shared: true,
      exposed: false,
      kind: 'regular' as const,
    },
    {
      id: 'src/idle',
      layerId: 'idle',
      shared: false,
      exposed: true,
      kind: 'isolated' as const,
    },
  ];
  const modules = unchangedModules.map((module) =>
    module.id === 'src/app'
      ? { ...module, changeStatus: 'modified' as const }
      : module.id === 'src/lib/b'
        ? { ...module, changeStatus: 'added' as const }
        : module,
  );
  const moduleGraphs = [
    {
      id: 'lib-graph',
      layerId: 'lib',
      path: 'src/lib',
      memberIds: ['src/lib/a', 'src/lib/b'],
      rules: [],
    },
    {
      id: 'idle-graph',
      layerId: 'idle',
      path: 'src/idle',
      memberIds: ['src/idle'],
      rules: [],
    },
  ];

  test('keeps changed Modules, their Layers, and the graphs still touching them', () => {
    const changed = changedArchitecture({
      layers,
      layerGraphs,
      modules,
      moduleGraphs,
    });
    expect(changed?.modules.map(({ id }) => id)).toEqual([
      'src/app',
      'src/lib/b',
    ]);
    expect(changed?.layers.map(({ id }) => id)).toEqual(['app', 'lib']);
    expect(changed?.layerGraphs.map(({ id }) => id)).toEqual(['main']);
    expect(changed?.moduleGraphs.map(({ id }) => id)).toEqual(['lib-graph']);
  });

  test('keeps a Layer that changed without a changed Module', () => {
    const changed = changedArchitecture({
      layers: [...layers, { id: 'docs', changeStatus: 'modified', scopes: [] }],
      layerGraphs,
      modules,
      moduleGraphs,
    });
    expect(changed?.layers.map(({ id }) => id)).toEqual(['app', 'lib', 'docs']);
  });

  test('is undefined when no Module changed', () => {
    expect(
      changedArchitecture({
        layers,
        layerGraphs,
        modules: unchangedModules,
        moduleGraphs,
      }),
    ).toBeUndefined();
  });
});
