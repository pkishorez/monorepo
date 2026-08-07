import { describe, expect, test } from 'vitest';

import type { FileGraph } from '../../../file-graph/index.js';
import { buildLayerContext } from '../../layers/layers.js';
import { analyzeModules } from '../index.js';
import type { ModuleDefinition } from '../modules.js';

const layerDefinitions = { app: { paths: ['src'] } };

function analyze(
  entries: readonly (readonly [string, readonly string[]])[],
  modules: Readonly<Record<string, ModuleDefinition>>,
) {
  const graph: FileGraph = new Map(entries);
  return analyzeModules(
    graph,
    modules,
    buildLayerContext(graph.keys(), layerDefinitions, {}),
    layerDefinitions,
  );
}

describe('analyzeModules', () => {
  test('reports files within a Layer that belong to no Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/unassigned.ts']],
        ['src/unassigned.ts', ['src/a/internal.ts']],
        ['src/a/internal.ts', []],
      ],
      { 'src/a': { shared: false, nested: [] } },
    );

    expect(result.violations).toEqual([
      { kind: 'coverage', file: 'src/unassigned.ts' },
    ]);
  });

  test('reports missing entry points when a Module declares exposure', () => {
    const result = analyze([['src/a/a.ts', []]], {
      'src/a': { shared: false, nested: ['public'] },
    });

    expect(result.violations).toEqual([
      {
        kind: 'missing-entry-point',
        module: 'src/a',
        path: 'src/a/index.ts',
      },
      {
        kind: 'missing-entry-point',
        module: 'src/a',
        path: 'src/a/public/index.ts',
      },
    ]);
  });

  test('classifies a Module without index.ts as unexposed', () => {
    const result = analyze([['src/cli/cli.ts', []]], {
      'src/cli': { shared: false, nested: [] },
    });

    expect(result.unexposedModules).toEqual(new Set(['src/cli']));
    expect(result.entryPoints).toEqual(new Set());
    expect(result.modules).toEqual([
      {
        path: 'src/cli',
        layer: 'app',
        shared: false,
        nested: [],
        kind: 'isolated',
      },
    ]);
    expect(result.violations).toEqual([]);
  });

  test('requires an entry point when a Module is Shared', () => {
    const result = analyze([['src/shared/internal.ts', []]], {
      'src/shared': { shared: true, nested: [] },
    });

    expect(result.unexposedModules).toEqual(new Set());
    expect(result.violations).toEqual([
      {
        kind: 'missing-entry-point',
        module: 'src/shared',
        path: 'src/shared/index.ts',
      },
    ]);
  });

  test('prevents a permitted cross-Layer dependency from consuming an Unexposed Module', () => {
    const graph: FileGraph = new Map([
      ['src/app/index.ts', ['src/cli/cli.ts']],
      ['src/cli/cli.ts', []],
    ]);
    const result = analyzeModules(
      graph,
      {
        'src/app': { shared: false, nested: [] },
        'src/cli': { shared: false, nested: [] },
      },
      buildLayerContext(
        graph.keys(),
        {
          app: { paths: ['src/app'] },
          cli: { paths: ['src/cli'] },
        },
        { app: ['cli'] },
      ),
      {
        app: { paths: ['src/app'] },
        cli: { paths: ['src/cli'] },
      },
    );

    expect(result.violations).toEqual([
      {
        kind: 'boundary',
        fromFile: 'src/app/index.ts',
        fromModule: 'src/app',
        toFile: 'src/cli/cli.ts',
        toModule: 'src/cli',
      },
    ]);
  });

  test('allows imports between files in the same Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/a/internal.ts']],
        ['src/a/internal.ts', []],
      ],
      { 'src/a': { shared: false, nested: [] } },
    );

    expect(result.violations).toEqual([]);
  });

  test('infers Module kind independently from Shared status', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/index.ts']],
        ['src/b/index.ts', ['src/c/index.ts']],
        ['src/c/index.ts', []],
        ['src/d/index.ts', []],
      ],
      {
        'src/a': { shared: true, nested: [] },
        'src/b': { shared: true, nested: [] },
        'src/c': { shared: true, nested: [] },
        'src/d': { shared: false, nested: [] },
      },
    );

    expect(result.modules).toEqual([
      {
        path: 'src/a',
        layer: 'app',
        shared: true,
        nested: [],
        kind: 'root',
      },
      {
        path: 'src/b',
        layer: 'app',
        shared: true,
        nested: [],
        kind: 'regular',
      },
      {
        path: 'src/c',
        layer: 'app',
        shared: true,
        nested: [],
        kind: 'terminal',
      },
      {
        path: 'src/d',
        layer: 'app',
        shared: false,
        nested: [],
        kind: 'isolated',
      },
    ]);
  });

  test('allows the project root to identify one Module', () => {
    const graph: FileGraph = new Map([
      ['index.ts', ['src/internal.ts']],
      ['src/internal.ts', []],
    ]);
    const result = analyzeModules(
      graph,
      { '.': { shared: false, nested: [] } },
      buildLayerContext(graph.keys(), { app: { paths: ['.'] } }, {}),
      { app: { paths: ['.'] } },
    );

    expect(result.violations).toEqual([]);
  });

  test('denies a same-Layer dependency before checking its boundary', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/internal.ts']],
        ['src/b/index.ts', []],
        ['src/b/internal.ts', []],
      ],
      {
        'src/a': { shared: false, nested: [] },
        'src/b': { shared: false, nested: [] },
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

  test('allows the root and configured nested doors of a Shared Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/index.ts', 'src/b/public/index.ts']],
        ['src/a/internal.ts', ['src/b/public/index.ts']],
        ['src/b/index.ts', []],
        ['src/b/public/index.ts', []],
      ],
      {
        'src/a': { shared: false, nested: [] },
        'src/b': { shared: true, nested: ['public'] },
      },
    );

    expect(result.violations).toEqual([]);
    expect(result.membership.get('src/a/index.ts')).toBe('src/a');
    expect(result.entryPoints).toEqual(
      new Set(['src/a/index.ts', 'src/b/index.ts', 'src/b/public/index.ts']),
    );
    expect(result.dependencies).toEqual([
      {
        fromModule: 'src/a',
        toModule: 'src/b',
        toEntryPoint: 'src/b/index.ts',
      },
      {
        fromModule: 'src/a',
        toModule: 'src/b',
        toEntryPoint: 'src/b/public/index.ts',
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
        'src/a': { shared: false, nested: [] },
        'src/b': { shared: true, nested: [] },
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
    ]);
  });

  test('defers a forbidden cross-Layer import to Layer lint', () => {
    const graph: FileGraph = new Map([
      ['src/app/index.ts', ['src/domain/internal.ts']],
      ['src/domain/index.ts', []],
      ['src/domain/internal.ts', []],
    ]);
    const result = analyzeModules(
      graph,
      {
        'src/app': { shared: false, nested: [] },
        'src/domain': { shared: false, nested: [] },
      },
      buildLayerContext(
        graph.keys(),
        {
          app: { paths: ['src/app'] },
          domain: { paths: ['src/domain'] },
        },
        {},
      ),
      {
        app: { paths: ['src/app'] },
        domain: { paths: ['src/domain'] },
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
        'src/a': { shared: true, nested: [] },
        'src/b': { shared: true, nested: [] },
      },
    );

    expect(result.violations).toEqual([
      { kind: 'cycle', modules: ['src/a', 'src/b'] },
    ]);
  });
});
