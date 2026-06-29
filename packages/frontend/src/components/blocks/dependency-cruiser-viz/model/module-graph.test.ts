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
    moduleCoverage: [cov('a', 'entry'), cov('b', 'mid'), cov('c', 'leaf')],
    coverageGaps: [],
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

describe('featureModuleGraph transitive reduction', () => {
  it('drops a direct edge implied by a longer path', () => {
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'mid'),
      edge('b', 'mid', 'c', 'leaf'),
      // Redundant: entry already reaches leaf via mid.
      edge('a', 'entry', 'c', 'leaf'),
    ]);
    const { edges } = featureModuleGraph(config, summary, 'orders');
    const pairs = edges.map((e) => `${e.from}->${e.to}`);
    expect(pairs).toContain('a::entry->b::mid');
    expect(pairs).toContain('b::mid->c::leaf');
    expect(pairs).not.toContain('a::entry->c::leaf');
  });

  it('keeps a breach edge even when an indirect legal path exists', () => {
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'mid'),
      edge('b', 'mid', 'c', 'leaf'),
      edge('a', 'entry', 'c', 'leaf', 'breach'),
    ]);
    const { edges } = featureModuleGraph(config, summary, 'orders');
    const breach = edges.find((e) => e.kind === 'breach');
    expect(breach).toEqual({ from: 'a::entry', to: 'c::leaf', kind: 'breach' });
  });

  it('preserves a 2-cycle (neither edge is redundant)', () => {
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'mid'),
      edge('b', 'mid', 'a', 'entry'),
    ]);
    const { edges } = featureModuleGraph(config, summary, 'orders');
    expect(edges).toHaveLength(2);
  });
});
