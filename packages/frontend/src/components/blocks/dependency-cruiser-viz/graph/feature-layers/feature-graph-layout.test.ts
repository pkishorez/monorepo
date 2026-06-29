import { describe, expect, it } from 'vitest';

import {
  feature,
  layer,
  layersTopDown,
  module,
  toVisualizationConfig,
  type VizSummary,
} from 'depcruise-viz';

import { featureModuleGraph } from '../../model';
import {
  COL_GAP,
  MODULE_NODE_WIDTH,
  computeFeatureGraphLayout,
} from './feature-graph-layout';

const COL_PITCH = MODULE_NODE_WIDTH + COL_GAP;

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
    module('src/a/entry2', { feature: 'orders' }),
    module('src/b/midX', { feature: 'orders' }),
    module('src/b/midY', { feature: 'orders' }),
    module('src/c/leaf', { feature: 'orders' }),
  ],
});

const cov = (l: string, m: string): VizSummary['moduleCoverage'][number] => ({
  module: m,
  layer: l,
  feature: 'orders',
  visibility: 'private',
  files: [`src/${l}/${m}.ts`],
});

function summaryWith(moduleEdges: VizSummary['moduleEdges']): VizSummary {
  return {
    ignoredFiles: [],
    violations: [],
    layerOrphanFiles: [],
    coveredFiles: [],
    moduleCoverage: [
      cov('a', 'entry'),
      cov('a', 'entry2'),
      cov('b', 'midX'),
      cov('b', 'midY'),
      cov('c', 'leaf'),
    ],
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

describe('computeFeatureGraphLayout columns by import depth', () => {
  it('lays each legal import strictly left → right', () => {
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'midX'),
      edge('b', 'midX', 'c', 'leaf'),
    ]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set());
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    // entry (source) → column 0, then each hop one column right.
    expect(xOf('a::entry')).toBe(0);
    expect(xOf('b::midX')).toBe(COL_PITCH);
    expect(xOf('c::leaf')).toBe(2 * COL_PITCH);
  });

  it('keeps every source in column 0, even a deep-layer one', () => {
    // `leaf` lives in the deepest layer but imports `entry`, so it is a SOURCE
    // (nothing imports it) and must sit in column 0, not the far right.
    const summary = summaryWith([edge('c', 'leaf', 'a', 'entry')]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set());
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('c::leaf')).toBe(0);
    expect(xOf('a::entry')).toBe(COL_PITCH);
  });

  it('does not let a breach edge push its target forward', () => {
    // A legal chain entry → midX, plus a breach leaf → entry. The breach must
    // not rank `entry`; it stays one column after its legal source only.
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'midX'),
      edge('c', 'leaf', 'a', 'entry', 'breach'),
    ]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set());
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('b::midX')).toBe(COL_PITCH);
    // `leaf` is a source over legal edges → column 0; its breach to `entry`
    // therefore renders right → left, flagging the violation.
    expect(xOf('c::leaf')).toBe(0);
  });

  it('reorders a column so children line up under their parents', () => {
    // entry (row 0) → midY, entry2 (row 1) → midX. The barycenter sweep should
    // flip the second column's declared order so each child sits under its
    // parent: midY above midX.
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'midY'),
      edge('a', 'entry2', 'b', 'midX'),
    ]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set());
    const yOf = (key: string) => nodes.find((n) => n.id === key)!.position.y;

    expect(yOf('b::midY')).toBeLessThan(yOf('b::midX'));
  });
});
