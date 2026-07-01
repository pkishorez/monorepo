import type { ICruiseResult } from 'dependency-cruiser';
import { describe, expect, test } from 'vitest';

import { summarizeCruiseResult } from '../src/analyze/summarize-cruise-result.js';
import type { VisualizationConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ICruiseResult from a list of (source → resolved[]) edges. */
function makeCruiseResult(
  edges: Array<{ source: string; deps: string[] }>,
): ICruiseResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modules = edges.map(({ source, deps }) => ({
    source,
    valid: true,
    dependencies: deps.map((resolved) => ({
      resolved,
      coreModule: false,
      couldNotResolve: false,
      dependencyTypes: [] as string[],
      dynamic: false,
      exoticallyRequired: false,
      followable: true,
      matchesDoNotFollow: false,
      module: resolved,
      moduleSystem: 'es6' as const,
      circular: false,
      protocol: undefined,
      mimeType: undefined,
      valid: true,
      instability: 0,
    })),
    dependents: [],
    orphan: false,
  }));
  return {
    modules,
    summary: {
      violations: [],
      error: 0,
      warn: 0,
      info: 0,
      ignore: 0,
      totalCruised: modules.length,
      totalDependenciesCruised: 0,
      optionsUsed: {},
    },
  } as unknown as ICruiseResult;
}

/** Minimal VisualizationConfig with one "app" stack, one "feat" layer, given
 * modules and features. rootDir is "." so all paths starting with "src/" pass
 * the isProjectPath check. */
function makeViz(opts: {
  modules: Array<{ path: string; name: string; barrel?: boolean }>;
  features: Array<{ name: string; root: string; modules: string[] }>;
}): VisualizationConfig {
  return {
    // rootDir must be a prefix of test source paths (e.g. 'src/x/index.ts')
    rootDir: 'src',
    stacks: [
      {
        name: 'app',
        layers: [
          {
            name: 'feat',
            paths: ['src'],
          },
        ],
        allowedImports: [],
      },
    ],
    modules: opts.modules.map((m) => ({
      path: m.path,
      name: m.name,
      layer: 'feat',
      barrel: m.barrel ?? false,
    })),
    features: opts.features,
  };
}

// ---------------------------------------------------------------------------
// Case 1 — featureGraphs edge restriction
// Feature A = {root:x, modules:[x,y,z]}, Feature B = {root:x1, modules:[x1,y,z1]}
// Real edges: x→y, y→z, x1→y, y→z1
// Expected: A edges = x→y, y→z; B edges = x1→y, y→z1; no violations
// ---------------------------------------------------------------------------
describe('featureGraphs edge restriction', () => {
  const cruiseResult = makeCruiseResult([
    { source: 'src/x/index.ts', deps: ['src/y/index.ts'] },
    { source: 'src/y/index.ts', deps: ['src/z/index.ts', 'src/z1/index.ts'] },
    { source: 'src/x1/index.ts', deps: ['src/y/index.ts'] },
    { source: 'src/z/index.ts', deps: [] },
    { source: 'src/z1/index.ts', deps: [] },
  ]);

  const viz = makeViz({
    modules: [
      { path: 'src/x', name: 'x' },
      { path: 'src/y', name: 'y' },
      { path: 'src/z', name: 'z' },
      { path: 'src/x1', name: 'x1' },
      { path: 'src/z1', name: 'z1' },
    ],
    features: [
      { name: 'A', root: 'x', modules: ['x', 'y', 'z'] },
      { name: 'B', root: 'x1', modules: ['x1', 'y', 'z1'] },
    ],
  });

  const summary = summarizeCruiseResult(cruiseResult, viz);

  test('feature A has exactly edges x→y and y→z', () => {
    const fg = summary.featureGraphs.find((f) => f.feature === 'A')!;
    expect(fg).toBeDefined();
    const edgeSet = new Set(fg.edges.map((e) => `${e.from}→${e.to}`));
    expect(edgeSet).toEqual(new Set(['feat::x→feat::y', 'feat::y→feat::z']));
  });

  test('feature B has exactly edges x1→y and y→z1', () => {
    const fg = summary.featureGraphs.find((f) => f.feature === 'B')!;
    expect(fg).toBeDefined();
    const edgeSet = new Set(fg.edges.map((e) => `${e.from}→${e.to}`));
    expect(edgeSet).toEqual(new Set(['feat::x1→feat::y', 'feat::y→feat::z1']));
  });

  test('no closure violations (y is shared → relaxed)', () => {
    // y→z1 is in B's member set and y is shared, so no closure-escape for A
    const relevant = summary.closureViolations.filter(
      (v) => v.reason === 'closure-escape' || v.reason === 'unclaimed-edge',
    );
    expect(relevant).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case 2 — unclaimed-edge violation
// Add real edge y→w where w is in no feature
// ---------------------------------------------------------------------------
describe('unclaimed-edge violation', () => {
  const cruiseResult = makeCruiseResult([
    { source: 'src/x/index.ts', deps: ['src/y/index.ts'] },
    {
      source: 'src/y/index.ts',
      deps: ['src/z/index.ts', 'src/z1/index.ts', 'src/w/index.ts'],
    },
    { source: 'src/x1/index.ts', deps: ['src/y/index.ts'] },
    { source: 'src/z/index.ts', deps: [] },
    { source: 'src/z1/index.ts', deps: [] },
    { source: 'src/w/index.ts', deps: [] },
  ]);

  const viz = makeViz({
    modules: [
      { path: 'src/x', name: 'x' },
      { path: 'src/y', name: 'y' },
      { path: 'src/z', name: 'z' },
      { path: 'src/x1', name: 'x1' },
      { path: 'src/z1', name: 'z1' },
      { path: 'src/w', name: 'w' },
    ],
    features: [
      { name: 'A', root: 'x', modules: ['x', 'y', 'z'] },
      { name: 'B', root: 'x1', modules: ['x1', 'y', 'z1'] },
    ],
  });

  const summary = summarizeCruiseResult(cruiseResult, viz);

  test('one unclaimed-edge violation for y→w', () => {
    const violations = summary.closureViolations.filter(
      (v) => v.reason === 'unclaimed-edge',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.fromModule).toBe('y');
    expect(violations[0]!.toModule).toBe('w');
  });
});

// ---------------------------------------------------------------------------
// Case 3 — barrel exemption
// x is barrel, imports y and y2 (y2 ∉ A); A's graph shows x→y only; no closure-escape
// ---------------------------------------------------------------------------
describe('barrel exemption', () => {
  const cruiseResult = makeCruiseResult([
    { source: 'src/x/index.ts', deps: ['src/y/index.ts', 'src/y2/index.ts'] },
    { source: 'src/y/index.ts', deps: ['src/z/index.ts'] },
    { source: 'src/z/index.ts', deps: [] },
    { source: 'src/y2/index.ts', deps: [] },
  ]);

  const viz = makeViz({
    modules: [
      { path: 'src/x', name: 'x', barrel: true },
      { path: 'src/y', name: 'y' },
      { path: 'src/z', name: 'z' },
      { path: 'src/y2', name: 'y2' },
    ],
    features: [{ name: 'A', root: 'x', modules: ['x', 'y', 'z'] }],
  });

  const summary = summarizeCruiseResult(cruiseResult, viz);

  test("A's graph shows x→y only (x→y2 dropped because y2 ∉ A)", () => {
    const fg = summary.featureGraphs.find((f) => f.feature === 'A')!;
    const edgeSet = new Set(fg.edges.map((e) => `${e.from}→${e.to}`));
    expect(edgeSet).toEqual(new Set(['feat::x→feat::y', 'feat::y→feat::z']));
  });

  test('no closure-escape for x→y2 (x is barrel)', () => {
    const escapes = summary.closureViolations.filter(
      (v) => v.reason === 'closure-escape',
    );
    expect(escapes).toHaveLength(0);
  });

  test('no unclaimed-edge for x→y2 (barrel origin exempt)', () => {
    const unclaimed = summary.closureViolations.filter(
      (v) => v.reason === 'unclaimed-edge',
    );
    expect(unclaimed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case 4 — multi-root violation
// Feature with two members that have no inbound edges from other members
// ---------------------------------------------------------------------------
describe('multi-root violation', () => {
  // Two disconnected modules in same feature: both are "roots"
  const cruiseResult = makeCruiseResult([
    { source: 'src/a/index.ts', deps: [] },
    { source: 'src/b/index.ts', deps: [] },
  ]);

  const viz = makeViz({
    modules: [
      { path: 'src/a', name: 'a' },
      { path: 'src/b', name: 'b' },
    ],
    features: [{ name: 'C', root: 'a', modules: ['a', 'b'] }],
  });

  const summary = summarizeCruiseResult(cruiseResult, viz);

  test('one multi-root violation for feature C', () => {
    const violations = summary.closureViolations.filter(
      (v) => v.reason === 'multi-root',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.feature).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// Case — duplicate module name across layers must not mis-attribute edges
// Two modules named `cart` (orchestrators + domain). A real edge
// orchestrators::cart → services::svc must NOT be pulled into a feature that
// owns domain::cart, nor relabeled as domain::cart → services::svc.
// ---------------------------------------------------------------------------
describe('duplicate module name across layers', () => {
  const cruiseResult = makeCruiseResult([
    // real: orchestrators/cart imports the service (upper → lower)
    {
      source: 'src/orchestrators/cart/index.ts',
      deps: ['src/services/svc/index.ts'],
    },
    // real: domain/cart imports a domain sibling
    {
      source: 'src/domain/cart/index.ts',
      deps: ['src/domain/order/index.ts'],
    },
    { source: 'src/services/svc/index.ts', deps: [] },
    { source: 'src/domain/order/index.ts', deps: [] },
  ]);

  const viz: VisualizationConfig = {
    rootDir: 'src',
    stacks: [
      {
        name: 'app',
        layers: [
          { name: 'orchestrators', paths: ['src/orchestrators'] },
          { name: 'services', paths: ['src/services'] },
          { name: 'domain', paths: ['src/domain'] },
        ],
        allowedImports: [],
      },
    ],
    modules: [
      // orchestrators::cart declared BEFORE domain::cart, so a name→layer map
      // would resolve `cart` to domain (last wins) — the mis-attribution trap.
      {
        path: 'src/orchestrators/cart',
        name: 'cart',
        layer: 'orchestrators',
        barrel: true,
      },
      {
        path: 'src/services/svc',
        name: 'svc',
        layer: 'services',
        barrel: false,
      },
      { path: 'src/domain/cart', name: 'cart', layer: 'domain', barrel: false },
      {
        path: 'src/domain/order',
        name: 'order',
        layer: 'domain',
        barrel: false,
      },
    ],
    features: [{ name: 'F', root: 'cart', modules: ['cart', 'svc', 'order'] }],
  };

  const summary = summarizeCruiseResult(cruiseResult, viz);
  const fg = summary.featureGraphs.find((f) => f.feature === 'F')!;
  const edgeSet = new Set(fg.edges.map((e) => `${e.from}→${e.to}`));

  test('does not fabricate a domain::cart → services::svc edge', () => {
    expect(edgeSet.has('domain::cart→services::svc')).toBe(false);
  });

  test('keeps the genuine domain::cart → domain::order edge', () => {
    expect(edgeSet.has('domain::cart→domain::order')).toBe(true);
  });

  test("the orchestrators::cart node's edge is excluded (not a member)", () => {
    expect(edgeSet).toEqual(new Set(['domain::cart→domain::order']));
  });
});
