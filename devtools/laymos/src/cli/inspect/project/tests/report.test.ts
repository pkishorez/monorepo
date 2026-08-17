import { describe, expect, test } from 'vitest';

import { renderProjectInspection } from '../report.js';

describe('renderProjectInspection', () => {
  test('renders Layer, Module, and violation counts', () => {
    const rendered = renderProjectInspection({
      config: {
        sourceRoots: ['src'],
        ignoredPaths: [],
        layers: {
          app: {
            paths: ['src'],
            modules: { 'src/app': { shared: false, exposed: false } },
            moduleGraphs: {},
          },
        },
        layerGraphs: {},
      },
      layerAnalysis: {
        membership: new Map(),
        allowedDependencies: new Map(),
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
            exposed: false,
            shape: 'directory',
            observedKind: 'isolated',
          },
        ],
        graphs: [],
        membership: new Map(),
        entryPoints: new Set(),
        dependencies: [],
        violations: [],
      },
    });

    expect(rendered).toBe(
      'Layers: 1\nModules: 1 (0 Shared, 0 exposed, 0 in a Module Graph)\nModule Graphs: 0\nLayer violations: 0\nModule violations: 0',
    );
  });
});
