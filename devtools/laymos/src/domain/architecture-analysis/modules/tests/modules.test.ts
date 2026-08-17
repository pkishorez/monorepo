import { describe, expect, test } from 'vitest';

import type { Config } from '../../../../architecture-analysis-schema/index.js';
import type { FileGraph } from '../../../file-graph/index.js';
import { resolveConfig } from '../../../project-config/index.js';
import { buildLayerContext } from '../../layers/index.js';
import { combineLayerRules } from '../../layer-rules.js';
import { analyzeModules } from '../index.js';

type LayerInput = {
  readonly paths: readonly string[];
  readonly modules?: Config['layers'][string]['modules'];
  readonly moduleGraphs?: Config['layers'][string]['moduleGraphs'];
};

function makeConfig(
  layers: Readonly<Record<string, LayerInput>>,
  rules: Readonly<Record<string, readonly string[]>> = {},
): Config {
  return {
    sourceRoots: ['src'],
    ignoredPaths: [],
    layers: Object.fromEntries(
      Object.entries(layers).map(([id, layer]) => [
        id,
        {
          paths: layer.paths,
          modules: layer.modules ?? {},
          moduleGraphs: layer.moduleGraphs ?? {},
        },
      ]),
    ),
    layerGraphs: { architecture: { rules } },
  } as Config;
}

function analyzeWith(
  entries: readonly (readonly [string, readonly string[]])[],
  layers: Readonly<Record<string, LayerInput>>,
  rules: Readonly<Record<string, readonly string[]>> = {},
) {
  const graph: FileGraph = new Map(entries);
  const config = makeConfig(layers, rules);
  return analyzeModules(
    graph,
    resolveConfig(config),
    buildLayerContext(graph.keys(), config.layers, combineLayerRules(config)),
    config,
  );
}

function analyze(
  entries: readonly (readonly [string, readonly string[]])[],
  modules: Config['layers'][string]['modules'],
) {
  return analyzeWith(entries, { app: { paths: ['src'], modules } });
}

describe('analyzeModules', () => {
  test('reports files within a Layer that belong to no Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/unassigned.ts']],
        ['src/unassigned.ts', ['src/a/internal.ts']],
        ['src/a/internal.ts', []],
      ],
      { 'src/a': { shared: false, exposed: true } },
    );

    expect(result.violations).toEqual([
      { kind: 'coverage', file: 'src/unassigned.ts' },
    ]);
  });

  test('requires an entry point when a Module declares exposure', () => {
    const result = analyze([['src/a/a.ts', []]], {
      'src/a': { shared: false, exposed: true },
    });

    expect(result.violations).toEqual([
      { kind: 'missing-entry-point', module: 'src/a', path: 'src/a/index.ts' },
    ]);
  });

  test('lets a Module importable by nobody omit index.ts', () => {
    const result = analyze([['src/cli/cli.ts', []]], {
      'src/cli': { shared: false, exposed: false },
    });

    expect(result.entryPoints).toEqual(new Set());
    expect(result.modules).toEqual([
      {
        path: 'src/cli',
        layer: 'app',
        shared: false,
        exposed: false,
        shape: 'directory',
        observedKind: 'isolated',
      },
    ]);
    expect(result.violations).toEqual([]);
  });

  test('requires an entry point when a Module is Shared', () => {
    const result = analyze([['src/shared/internal.ts', []]], {
      'src/shared': { shared: true, exposed: false },
    });

    expect(result.violations).toEqual([
      {
        kind: 'missing-entry-point',
        module: 'src/shared',
        path: 'src/shared/index.ts',
      },
      { kind: 'unused-shared', module: 'src/shared' },
    ]);
  });

  test('reports a Shared Module with no same-Layer dependent', () => {
    const result = analyze(
      [
        ['src/app/index.ts', []],
        ['src/shared/index.ts', []],
      ],
      {
        'src/app': { shared: false, exposed: true },
        'src/shared': { shared: true, exposed: false },
      },
    );

    expect(result.violations).toContainEqual({
      kind: 'unused-shared',
      module: 'src/shared',
    });
  });

  test('denies a permitted cross-Layer dependency to a Module that is not exposed', () => {
    const result = analyzeWith(
      [
        ['src/app/index.ts', ['src/cli/cli.ts']],
        ['src/cli/cli.ts', []],
      ],
      {
        app: {
          paths: ['src/app'],
          modules: { 'src/app': { shared: false, exposed: true } },
        },
        cli: {
          paths: ['src/cli'],
          modules: { 'src/cli': { shared: false, exposed: false } },
        },
      },
      { app: ['cli'] },
    );

    expect(result.violations).toEqual([
      {
        kind: 'dependency',
        fromFile: 'src/app/index.ts',
        fromModule: 'src/app',
        toFile: 'src/cli/cli.ts',
        toModule: 'src/cli',
      },
      { kind: 'dead-module', module: 'src/cli' },
    ]);
    expect(result.dependencies).toEqual([
      { fromModule: 'src/app', toModule: 'src/cli', permitted: false },
    ]);
  });

  test('treats an unimported private Module in a root Layer as an Intentional root', () => {
    const result = analyzeWith(
      [
        ['src/app/main.ts', ['src/domain/index.ts']],
        ['src/domain/index.ts', []],
      ],
      {
        app: {
          paths: ['src/app'],
          modules: { 'src/app': { shared: false, exposed: false } },
        },
        domain: {
          paths: ['src/domain'],
          modules: { 'src/domain': { shared: false, exposed: true } },
        },
      },
      { app: ['domain'] },
    );

    expect(result.violations).toEqual([]);
  });

  test('allows imports between files in the same Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/a/internal.ts']],
        ['src/a/internal.ts', []],
      ],
      { 'src/a': { shared: false, exposed: true } },
    );

    expect(result.violations).toEqual([]);
  });

  test('treats a configured source file as its own public Module', () => {
    const result = analyze(
      [
        ['src/card.tsx', ['src/button.tsx']],
        ['src/button.tsx', []],
      ],
      {
        'src/card.tsx': { shared: false, exposed: true },
        'src/button.tsx': { shared: true, exposed: false },
      },
    );

    expect(result.entryPoints).toEqual(
      new Set(['src/card.tsx', 'src/button.tsx']),
    );
    expect(result.dependencies).toEqual([
      {
        fromModule: 'src/card.tsx',
        toModule: 'src/button.tsx',
        toEntryPoint: 'src/button.tsx',
        permitted: true,
      },
    ]);
    expect(result.violations).toEqual([]);
  });

  test('infers observed kind independently from declared visibility', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/index.ts']],
        ['src/b/index.ts', ['src/c/index.ts']],
        ['src/c/index.ts', []],
        ['src/d/index.ts', []],
      ],
      {
        'src/a': { shared: false, exposed: true },
        'src/b': { shared: true, exposed: false },
        'src/c': { shared: true, exposed: false },
        'src/d': { shared: false, exposed: true },
      },
    );

    expect(
      result.modules.map(({ path, observedKind }) => ({ path, observedKind })),
    ).toEqual([
      { path: 'src/a', observedKind: 'root' },
      { path: 'src/b', observedKind: 'regular' },
      { path: 'src/c', observedKind: 'terminal' },
      { path: 'src/d', observedKind: 'isolated' },
    ]);
  });

  test('denies a same-Layer dependency before checking its boundary', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/internal.ts']],
        ['src/b/index.ts', []],
        ['src/b/internal.ts', []],
      ],
      {
        'src/a': { shared: false, exposed: true },
        'src/b': { shared: false, exposed: true },
      },
    );

    expect(result.violations).toEqual([
      {
        kind: 'dependency',
        fromFile: 'src/a/index.ts',
        fromModule: 'src/a',
        toFile: 'src/b/internal.ts',
        toModule: 'src/b',
      },
    ]);
  });

  test('rejects an internal target of an otherwise permitted dependency', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/internal.ts']],
        ['src/b/index.ts', []],
        ['src/b/internal.ts', []],
      ],
      {
        'src/a': { shared: false, exposed: true },
        'src/b': { shared: true, exposed: false },
      },
    );

    expect(result.violations).toEqual([
      {
        kind: 'boundary',
        fromFile: 'src/a/index.ts',
        fromModule: 'src/a',
        toFile: 'src/b/internal.ts',
        toModule: 'src/b',
      },
      { kind: 'unused-shared', module: 'src/b' },
    ]);
  });

  test('defers a forbidden cross-Layer import to Layer lint', () => {
    const result = analyzeWith(
      [
        ['src/app/index.ts', ['src/domain/internal.ts']],
        ['src/domain/index.ts', []],
        ['src/domain/internal.ts', []],
      ],
      {
        app: {
          paths: ['src/app'],
          modules: { 'src/app': { shared: false, exposed: true } },
        },
        domain: {
          paths: ['src/domain'],
          modules: { 'src/domain': { shared: false, exposed: true } },
        },
      },
    );

    expect(result.violations).toEqual([]);
  });

  test('reports cycles formed by otherwise valid Module dependencies', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/index.ts']],
        ['src/b/index.ts', ['src/a/index.ts']],
      ],
      {
        'src/a': { shared: true, exposed: false },
        'src/b': { shared: true, exposed: false },
      },
    );

    expect(result.violations).toEqual([
      { kind: 'cycle', modules: ['src/a', 'src/b'] },
    ]);
  });
});

describe('analyzeModules with Module Graphs', () => {
  const feature = {
    paths: ['src/feature'],
    moduleGraphs: {
      feature: {
        path: 'src/feature',
        modules: {
          'index.ts': { shared: false, exposed: true },
          core: { shared: false, exposed: false },
          model: { shared: false, exposed: false },
        },
        rules: { 'index.ts': ['core'], core: ['model'] },
      },
    },
  } satisfies LayerInput;

  test('permits a declared Rule between two members', () => {
    const result = analyzeWith(
      [
        ['src/feature/index.ts', ['src/feature/core/index.ts']],
        ['src/feature/core/index.ts', ['src/feature/model/index.ts']],
        ['src/feature/model/index.ts', []],
      ],
      { app: feature },
    );

    expect(result.violations).toEqual([]);
    expect(result.graphs).toEqual([
      {
        id: 'feature',
        layer: 'app',
        path: 'src/feature',
        members: [
          'src/feature/core',
          'src/feature/index.ts',
          'src/feature/model',
        ],
        rules: { 'index.ts': ['core'], core: ['model'] },
      },
    ]);
  });

  test('denies an undeclared edge, because Rules are not transitive', () => {
    const result = analyzeWith(
      [
        ['src/feature/index.ts', ['src/feature/model/index.ts']],
        ['src/feature/core/index.ts', ['src/feature/model/index.ts']],
        ['src/feature/model/index.ts', []],
      ],
      { app: feature },
    );

    expect(result.violations).toEqual([
      {
        kind: 'dependency',
        fromFile: 'src/feature/index.ts',
        fromModule: 'src/feature/index.ts',
        toFile: 'src/feature/model/index.ts',
        toModule: 'src/feature/model',
      },
    ]);
  });

  test('reports a file below a Module Graph that belongs to no member', () => {
    const result = analyzeWith(
      [
        ['src/feature/index.ts', ['src/feature/core/index.ts']],
        ['src/feature/core/index.ts', ['src/feature/model/index.ts']],
        ['src/feature/model/index.ts', []],
        ['src/feature/loose.ts', []],
      ],
      { app: feature },
    );

    expect(result.violations).toContainEqual({
      kind: 'graph-coverage',
      graph: 'feature',
      file: 'src/feature/loose.ts',
    });
  });

  test('reports a member no Rule reaches and nothing exposes', () => {
    const result = analyzeWith(
      [
        ['src/feature/index.ts', ['src/feature/core/index.ts']],
        ['src/feature/core/index.ts', []],
        ['src/feature/model/index.ts', []],
      ],
      {
        app: {
          paths: ['src/feature'],
          moduleGraphs: {
            feature: {
              path: 'src/feature',
              modules: {
                'index.ts': { shared: false, exposed: true },
                core: { shared: false, exposed: false },
                model: { shared: false, exposed: false },
              },
              rules: { 'index.ts': ['core'] },
            },
          },
        },
      },
    );

    expect(result.violations).toEqual([
      { kind: 'dead-module', module: 'src/feature/model' },
    ]);
  });

  test('denies an import from a free-form peer into a Module Graph member', () => {
    const result = analyzeWith(
      [
        ['src/peer/index.ts', ['src/feature/index.ts']],
        ['src/feature/index.ts', ['src/feature/core/index.ts']],
        ['src/feature/core/index.ts', ['src/feature/model/index.ts']],
        ['src/feature/model/index.ts', []],
      ],
      {
        app: {
          paths: ['src'],
          modules: { 'src/peer': { shared: false, exposed: true } },
          moduleGraphs: feature.moduleGraphs,
        },
      },
    );

    expect(result.violations).toEqual([
      {
        kind: 'dependency',
        fromFile: 'src/peer/index.ts',
        fromModule: 'src/peer',
        toFile: 'src/feature/index.ts',
        toModule: 'src/feature/index.ts',
      },
    ]);
  });

  test('lets a member import a free-form Shared Module in its Layer', () => {
    const result = analyzeWith(
      [
        ['src/feature/index.ts', ['src/feature/core/index.ts']],
        ['src/feature/core/index.ts', ['src/common/index.ts']],
        ['src/feature/model/index.ts', ['src/common/index.ts']],
        ['src/common/index.ts', []],
      ],
      {
        app: {
          paths: ['src'],
          modules: { 'src/common': { shared: true, exposed: false } },
          moduleGraphs: feature.moduleGraphs,
        },
      },
    );

    expect(result.violations).toEqual([]);
  });

  test('denies an import into another Module Graph', () => {
    const result = analyzeWith(
      [
        ['src/left/index.ts', ['src/right/index.ts']],
        ['src/left/core/index.ts', []],
        ['src/right/index.ts', []],
        ['src/right/core/index.ts', []],
      ],
      {
        app: {
          paths: ['src'],
          moduleGraphs: {
            left: {
              path: 'src/left',
              modules: {
                'index.ts': { shared: false, exposed: true },
                core: { shared: false, exposed: true },
              },
              rules: {},
            },
            right: {
              path: 'src/right',
              modules: {
                'index.ts': { shared: false, exposed: true },
                core: { shared: false, exposed: true },
              },
              rules: {},
            },
          },
        },
      },
    );

    expect(result.violations).toEqual([
      {
        kind: 'dependency',
        fromFile: 'src/left/index.ts',
        fromModule: 'src/left/index.ts',
        toFile: 'src/right/index.ts',
        toModule: 'src/right/index.ts',
      },
    ]);
  });

  test('lets another Layer reach an exposed member but not a private one', () => {
    const result = analyzeWith(
      [
        [
          'src/app/main.ts',
          ['src/feature/index.ts', 'src/feature/core/index.ts'],
        ],
        ['src/feature/index.ts', ['src/feature/core/index.ts']],
        ['src/feature/core/index.ts', ['src/feature/model/index.ts']],
        ['src/feature/model/index.ts', []],
      ],
      {
        app: {
          paths: ['src/app'],
          modules: { 'src/app': { shared: false, exposed: false } },
        },
        feature,
      },
      { app: ['feature'] },
    );

    expect(result.violations).toEqual([
      {
        kind: 'dependency',
        fromFile: 'src/app/main.ts',
        fromModule: 'src/app',
        toFile: 'src/feature/core/index.ts',
        toModule: 'src/feature/core',
      },
    ]);
  });
});
