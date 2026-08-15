import { describe, expect, test } from 'vitest';

import { renderProjectInspection } from '../report.js';

describe('renderProjectInspection', () => {
  test('renders Layer, Module, and violation counts', () => {
    const rendered = renderProjectInspection({
      config: {
        sourceRoots: ['src'],
        ignoredPaths: [],
        layers: { app: { paths: ['src'] } },
        modules: {
          'src/app': { kind: 'entry', subpaths: [] },
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
            kind: 'entry',
            shape: 'directory',
            observedKind: 'isolated',
            subpaths: [],
          },
        ],
        membership: new Map(),
        entryPoints: new Set(),
        dependencies: [],
        violations: [],
      },
    });

    expect(rendered).toBe(
      'Layers: 1\nModules: 1 (0 Normal, 0 Shared, 1 Entry)\nLayer violations: 0\nModule violations: 0',
    );
  });
});
