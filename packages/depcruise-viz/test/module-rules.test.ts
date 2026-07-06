import type { ICruiseResult } from 'dependency-cruiser';
import { describe, expect, test } from 'vitest';

import { summarizeCruiseResult } from '../src/index.js';
import type { ModuleRules, VisualizationConfig } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One layer `app` over `src`, with the given modules under it. */
function makeViz(
  modules: Array<{
    path: string;
    name: string;
    opaque?: boolean;
    rules?: ModuleRules;
  }>,
): VisualizationConfig {
  return {
    rootDir: 'src',
    stacks: [
      {
        name: 'app',
        layers: [{ name: 'app', paths: ['src'] }],
        edges: [],
        allowedImports: [{ from: 'app', to: 'app' }],
      },
    ],
    modules: modules.map((m) => ({
      path: m.path,
      name: m.name,
      layer: 'app',
      opaque: m.opaque ?? false,
      ...(m.rules === undefined ? {} : { rules: m.rules }),
    })),
  };
}

/** A cruise result from a flat list of file-level import edges. */
function makeCruise(edges: Array<[from: string, to: string]>): ICruiseResult {
  const bySource = new Map<string, string[]>();
  for (const [from, to] of edges) {
    bySource.set(from, [...(bySource.get(from) ?? []), to]);
    if (!bySource.has(to)) bySource.set(to, []);
  }
  return {
    modules: [...bySource.entries()].map(([source, targets]) => ({
      source,
      dependencies: targets.map((resolved) => ({
        resolved,
        couldNotResolve: false,
        coreModule: false,
      })),
    })),
    summary: { violations: [] },
  } as unknown as ICruiseResult;
}

// ---------------------------------------------------------------------------
// summarizeCruiseResult — moduleViolations
// ---------------------------------------------------------------------------

describe('module rules', () => {
  test('no rules produces no module violations', () => {
    const viz = makeViz([
      { path: 'src/a', name: 'a' },
      { path: 'src/b', name: 'b' },
    ]);
    const summary = summarizeCruiseResult(
      makeCruise([['src/a/index.ts', 'src/b/index.ts']]),
      viz,
    );
    expect(summary.moduleViolations).toEqual([]);
    expect(summary.moduleEdges[0]!.kind).toBe('legal');
  });

  test('root: any import of the module is a violation', () => {
    const viz = makeViz([
      { path: 'src/a', name: 'a' },
      { path: 'src/b', name: 'b', rules: { root: true } },
    ]);
    const summary = summarizeCruiseResult(
      makeCruise([['src/a/index.ts', 'src/b/index.ts']]),
      viz,
    );
    expect(summary.moduleViolations).toEqual([
      {
        module: 'b',
        rule: 'root',
        from: 'a',
        to: 'b',
        fromFile: 'src/a/index.ts',
        toFile: 'src/b/index.ts',
      },
    ]);
    expect(summary.moduleEdges[0]!.kind).toBe('breach');
  });

  test('leaf: any import by the module is a violation', () => {
    const viz = makeViz([
      { path: 'src/a', name: 'a', rules: { leaf: true } },
      { path: 'src/b', name: 'b' },
    ]);
    const summary = summarizeCruiseResult(
      makeCruise([['src/a/index.ts', 'src/b/index.ts']]),
      viz,
    );
    expect(summary.moduleViolations).toEqual([
      {
        module: 'a',
        rule: 'leaf',
        from: 'a',
        to: 'b',
        fromFile: 'src/a/index.ts',
        toFile: 'src/b/index.ts',
      },
    ]);
  });

  test('leaf on an opaque module still sees its outgoing edges', () => {
    const viz = makeViz([
      { path: 'src/a', name: 'a', opaque: true, rules: { leaf: true } },
      { path: 'src/b', name: 'b' },
    ]);
    const summary = summarizeCruiseResult(
      makeCruise([['src/a/index.ts', 'src/b/index.ts']]),
      viz,
    );
    expect(summary.moduleViolations).toHaveLength(1);
    expect(summary.moduleViolations[0]!.rule).toBe('leaf');
    // opaque drops the outgoing edge from the module graph, so no breach edge
    expect(summary.moduleEdges).toEqual([]);
  });

  test('onlyImports: imports outside the allowed set are violations', () => {
    const viz = makeViz([
      { path: 'src/a', name: 'a', rules: { onlyImports: ['src/b'] } },
      { path: 'src/b', name: 'b' },
      { path: 'src/c', name: 'c' },
    ]);
    const summary = summarizeCruiseResult(
      makeCruise([
        ['src/a/index.ts', 'src/b/index.ts'],
        ['src/a/index.ts', 'src/c/index.ts'],
      ]),
      viz,
    );
    expect(summary.moduleViolations).toEqual([
      {
        module: 'a',
        rule: 'onlyImports',
        from: 'a',
        to: 'c',
        fromFile: 'src/a/index.ts',
        toFile: 'src/c/index.ts',
      },
    ]);
  });

  test('onlyImportedBy: importers outside the allowed set are violations', () => {
    const viz = makeViz([
      { path: 'src/a', name: 'a' },
      { path: 'src/b', name: 'b', rules: { onlyImportedBy: ['src/a'] } },
      { path: 'src/c', name: 'c' },
    ]);
    const summary = summarizeCruiseResult(
      makeCruise([
        ['src/a/index.ts', 'src/b/index.ts'],
        ['src/c/index.ts', 'src/b/index.ts'],
      ]),
      viz,
    );
    expect(summary.moduleViolations).toEqual([
      {
        module: 'b',
        rule: 'onlyImportedBy',
        from: 'c',
        to: 'b',
        fromFile: 'src/c/index.ts',
        toFile: 'src/b/index.ts',
      },
    ]);
  });

  test('intra-module and un-moduled imports are out of scope', () => {
    const viz = makeViz([{ path: 'src/a', name: 'a', rules: { leaf: true } }]);
    const summary = summarizeCruiseResult(
      makeCruise([
        ['src/a/index.ts', 'src/a/util.ts'],
        ['src/a/index.ts', 'src/free-file.ts'],
      ]),
      viz,
    );
    expect(summary.moduleViolations).toEqual([]);
  });
});
