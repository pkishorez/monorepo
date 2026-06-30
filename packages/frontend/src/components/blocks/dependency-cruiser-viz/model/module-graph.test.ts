import { describe, expect, it } from 'vitest';

import {
  feature,
  layer,
  layersTopDown,
  module,
  toVisualizationConfig,
  type VizSummary,
} from 'depcruise-viz';

import { featureModuleGraph } from './module-graph';

const config = toVisualizationConfig({
  rootDir: 'src',
  rules: [
    layersTopDown('app', [
      layer('a', ['src/a']),
      layer('b', ['src/b']),
      layer('c', ['src/c']),
    ]),
  ],
  features: [feature('orders', {})],
  modules: [
    module('src/a/entry', { feature: 'orders' }),
    module('src/b/mid', { feature: 'orders' }),
    module('src/b/mid/sub', { feature: 'orders' }),
    module('src/c/leaf', { feature: 'orders' }),
  ],
});

function summaryWith(moduleEdges: VizSummary['moduleEdges']): VizSummary {
  const cov = (l: string, m: string): VizSummary['moduleCoverage'][number] => ({
    module: m,
    layer: l,
    feature: 'orders',
    visibility: 'private',
    files: [`src/${l}/${m}.ts`],
  });
  return {
    ignoredFiles: [],
    violations: [],
    layerOrphanFiles: [],
    coveredFiles: [],
    moduleCoverage: [
      cov('a', 'entry'),
      cov('b', 'mid'),
      cov('b', 'mid/sub'),
      cov('c', 'leaf'),
    ],
    coverageGaps: [],
    emptyModules: [],
    conflicts: [],
    breaches: [],
    featureEdges: [],
    featureModuleEdges: [],
    moduleEdges,
  };
}

const edge = (
  fromLayer: string,
  fromModule: string,
  toLayer: string,
  toModule: string,
  kind: 'legal' | 'breach' = 'legal',
): VizSummary['moduleEdges'][number] => ({
  fromLayer,
  fromModule,
  toLayer,
  toModule,
  kind,
});

describe('featureModuleGraph edges', () => {
  it('keeps every real import, including ones implied by a longer path', () => {
    // No transitive reduction: the direct entry → leaf edge is kept alongside
    // the entry → mid → leaf path, so the graph shows the full import map.
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'mid'),
      edge('b', 'mid', 'c', 'leaf'),
      edge('a', 'entry', 'c', 'leaf'),
    ]);
    const { edges } = featureModuleGraph(config, summary, 'orders');
    const pairs = edges.map((e) => `${e.from}->${e.to}`);
    expect(pairs).toContain('a::entry->b::mid');
    expect(pairs).toContain('b::mid->c::leaf');
    expect(pairs).toContain('a::entry->c::leaf');
  });

  it('keeps a breach edge', () => {
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'mid'),
      edge('a', 'entry', 'c', 'leaf', 'breach'),
    ]);
    const { edges } = featureModuleGraph(config, summary, 'orders');
    const breach = edges.find((e) => e.kind === 'breach');
    expect(breach).toEqual({ from: 'a::entry', to: 'c::leaf', kind: 'breach' });
  });

  it('suppresses edges between a module and its nested sub-module', () => {
    // `mid` and `mid/sub` are the same containment family — folder nesting, not
    // a dependency. Both directions are dropped; cross-family edges stay.
    const summary = summaryWith([
      edge('b', 'mid', 'b', 'mid/sub'),
      edge('b', 'mid/sub', 'b', 'mid'),
      edge('b', 'mid/sub', 'c', 'leaf'),
    ]);
    const { edges } = featureModuleGraph(config, summary, 'orders');
    const pairs = edges.map((e) => `${e.from}->${e.to}`);
    expect(pairs).not.toContain('b::mid->b::mid/sub');
    expect(pairs).not.toContain('b::mid/sub->b::mid');
    expect(pairs).toContain('b::mid/sub->c::leaf');
  });
});
