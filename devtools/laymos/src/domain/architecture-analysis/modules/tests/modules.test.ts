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
      { 'src/a': { kind: 'normal', subpaths: [] } },
    );

    expect(result.violations).toEqual([
      { kind: 'coverage', file: 'src/unassigned.ts' },
    ]);
  });

  test('reports missing entry points when a Module declares exposure', () => {
    const result = analyze([['src/a/a.ts', []]], {
      'src/a': { kind: 'normal', subpaths: ['public'] },
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

  test('lets an Entry Module omit index.ts', () => {
    const result = analyze([['src/cli/cli.ts', []]], {
      'src/cli': { kind: 'entry', subpaths: [] },
    });

    expect(result.entryPoints).toEqual(new Set());
    expect(result.modules).toEqual([
      {
        path: 'src/cli',
        layer: 'app',
        kind: 'entry',
        shape: 'directory',
        observedKind: 'isolated',
        subpaths: [],
      },
    ]);
    expect(result.violations).toEqual([]);
  });

  test('requires an entry point when a Module is Shared', () => {
    const result = analyze([['src/shared/internal.ts', []]], {
      'src/shared': { kind: 'shared', subpaths: [] },
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
        'src/app': { kind: 'normal', subpaths: [] },
        'src/shared': { kind: 'shared', subpaths: [] },
      },
    );

    expect(result.violations).toContainEqual({
      kind: 'unused-shared',
      module: 'src/shared',
    });
  });

  test('allows a permitted cross-Layer dependency to a Shared Module without counting it as peer use', () => {
    const graph: FileGraph = new Map([
      ['src/app/index.ts', ['src/domain/index.ts']],
      ['src/domain/index.ts', []],
      ['src/domain/peer.ts', []],
    ]);
    const result = analyzeModules(
      graph,
      {
        'src/app': { kind: 'normal', subpaths: [] },
        'src/domain': { kind: 'shared', subpaths: [] },
        'src/domain/peer.ts': { kind: 'normal', subpaths: [] },
      },
      buildLayerContext(
        graph.keys(),
        {
          app: { paths: ['src/app'] },
          domain: { paths: ['src/domain'] },
        },
        { app: ['domain'] },
      ),
      {
        app: { paths: ['src/app'] },
        domain: { paths: ['src/domain'] },
      },
    );

    expect(result.violations).toEqual([
      { kind: 'unused-shared', module: 'src/domain' },
    ]);
  });

  test('prevents a permitted cross-Layer dependency from consuming an Entry Module', () => {
    const graph: FileGraph = new Map([
      ['src/app/index.ts', ['src/cli/cli.ts']],
      ['src/cli/cli.ts', []],
    ]);
    const result = analyzeModules(
      graph,
      {
        'src/app': { kind: 'normal', subpaths: [] },
        'src/cli': { kind: 'entry', subpaths: [] },
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
        kind: 'dependency',
        fromFile: 'src/app/index.ts',
        fromModule: 'src/app',
        toFile: 'src/cli/cli.ts',
        toModule: 'src/cli',
      },
    ]);
    expect(result.dependencies).toEqual([
      { fromModule: 'src/app', toModule: 'src/cli' },
    ]);
    expect(
      result.modules.map(({ path, observedKind }) => ({ path, observedKind })),
    ).toEqual([
      { path: 'src/app', observedKind: 'root' },
      { path: 'src/cli', observedKind: 'terminal' },
    ]);
  });

  test('allows imports between files in the same Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/a/internal.ts']],
        ['src/a/internal.ts', []],
      ],
      { 'src/a': { kind: 'normal', subpaths: [] } },
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
        'src/card.tsx': { kind: 'normal', subpaths: [] },
        'src/button.tsx': { kind: 'shared', subpaths: [] },
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
      },
    ]);
    expect(
      result.modules.map(({ path, observedKind }) => ({ path, observedKind })),
    ).toEqual([
      { path: 'src/card.tsx', observedKind: 'root' },
      { path: 'src/button.tsx', observedKind: 'terminal' },
    ]);
    expect(result.violations).toEqual([]);
  });

  test('infers observed kind independently from configured kind', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/index.ts']],
        ['src/b/index.ts', ['src/c/index.ts']],
        ['src/c/index.ts', []],
        ['src/d/index.ts', []],
      ],
      {
        'src/a': { kind: 'normal', subpaths: [] },
        'src/b': { kind: 'shared', subpaths: [] },
        'src/c': { kind: 'shared', subpaths: [] },
        'src/d': { kind: 'normal', subpaths: [] },
      },
    );

    expect(result.modules).toEqual([
      {
        path: 'src/a',
        layer: 'app',
        kind: 'normal',
        shape: 'directory',
        observedKind: 'root',
        subpaths: [],
      },
      {
        path: 'src/b',
        layer: 'app',
        kind: 'shared',
        shape: 'directory',
        observedKind: 'regular',
        subpaths: [],
      },
      {
        path: 'src/c',
        layer: 'app',
        kind: 'shared',
        shape: 'directory',
        observedKind: 'terminal',
        subpaths: [],
      },
      {
        path: 'src/d',
        layer: 'app',
        kind: 'normal',
        shape: 'directory',
        observedKind: 'isolated',
        subpaths: [],
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
      { '.': { kind: 'normal', subpaths: [] } },
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
        'src/a': { kind: 'normal', subpaths: [] },
        'src/b': { kind: 'normal', subpaths: [] },
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

  test('allows the root and configured Subpaths of a Shared Module', () => {
    const result = analyze(
      [
        ['src/a/index.ts', ['src/b/index.ts', 'src/b/public/index.ts']],
        ['src/a/internal.ts', ['src/b/public/index.ts']],
        ['src/b/index.ts', []],
        ['src/b/public/index.ts', []],
      ],
      {
        'src/a': { kind: 'normal', subpaths: [] },
        'src/b': { kind: 'shared', subpaths: ['public'] },
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
        'src/a': { kind: 'normal', subpaths: [] },
        'src/b': { kind: 'shared', subpaths: [] },
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
    const graph: FileGraph = new Map([
      ['src/app/index.ts', ['src/domain/internal.ts']],
      ['src/domain/index.ts', []],
      ['src/domain/internal.ts', []],
    ]);
    const result = analyzeModules(
      graph,
      {
        'src/app': { kind: 'normal', subpaths: [] },
        'src/domain': { kind: 'normal', subpaths: [] },
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
        'src/a': { kind: 'shared', subpaths: [] },
        'src/b': { kind: 'shared', subpaths: [] },
      },
    );

    expect(result.violations).toEqual([
      { kind: 'cycle', modules: ['src/a', 'src/b'] },
    ]);
  });
});
