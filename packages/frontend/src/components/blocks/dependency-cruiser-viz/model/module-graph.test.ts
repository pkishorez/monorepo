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
  features: [
    feature('orders', {
      root: 'entry',
      modules: ['entry', 'mid', 'mid/sub', 'leaf'],
    }),
  ],
  modules: [
    module('src/a/entry'),
    module('src/b/mid'),
    module('src/b/mid/sub'),
    module('src/c/leaf'),
  ],
});

function summaryWith(
  nodes: string[],
  edges: VizSummary['featureGraphs'][number]['edges'],
): VizSummary {
  return {
    ignoredFiles: [],
    violations: [],
    layerOrphanFiles: [],
    coveredFiles: [],
    moduleCoverage: [
      { module: 'entry', layer: 'a', files: ['src/a/entry.ts'] },
      { module: 'mid', layer: 'b', files: ['src/b/mid.ts'] },
      { module: 'mid/sub', layer: 'b', files: ['src/b/mid/sub.ts'] },
      { module: 'leaf', layer: 'c', files: ['src/c/leaf.ts'] },
    ],
    coverageGaps: [],
    emptyModules: [],
    conflicts: [],
    moduleEdges: [],
    featureGraphs: [{ feature: 'orders', root: 'a::entry', nodes, edges }],
    closureViolations: [],
  };
}

describe('featureModuleGraph', () => {
  it('returns nodes for every key listed in featureGraphs', () => {
    const summary = summaryWith(
      ['a::entry', 'b::mid', 'b::mid/sub', 'c::leaf'],
      [
        { from: 'a::entry', to: 'b::mid', kind: 'legal' },
        { from: 'b::mid', to: 'c::leaf', kind: 'legal' },
        { from: 'a::entry', to: 'c::leaf', kind: 'legal' },
      ],
    );
    const { nodes, edges } = featureModuleGraph(config, summary, 'orders');
    const keys = nodes.map((n) => n.key);
    expect(keys).toContain('a::entry');
    expect(keys).toContain('b::mid');
    expect(keys).toContain('c::leaf');
    const pairs = edges.map((e) => `${e.from}->${e.to}`);
    expect(pairs).toContain('a::entry->b::mid');
    expect(pairs).toContain('b::mid->c::leaf');
    expect(pairs).toContain('a::entry->c::leaf');
  });

  it('keeps a breach edge', () => {
    const summary = summaryWith(
      ['a::entry', 'b::mid', 'c::leaf'],
      [
        { from: 'a::entry', to: 'b::mid', kind: 'legal' },
        { from: 'a::entry', to: 'c::leaf', kind: 'breach' },
      ],
    );
    const { edges } = featureModuleGraph(config, summary, 'orders');
    const breach = edges.find((e) => e.kind === 'breach');
    expect(breach).toEqual({ from: 'a::entry', to: 'c::leaf', kind: 'breach' });
  });

  it('returns empty graph for unknown feature', () => {
    const summary = summaryWith(['a::entry'], []);
    const { nodes, edges } = featureModuleGraph(config, summary, 'nonexistent');
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
