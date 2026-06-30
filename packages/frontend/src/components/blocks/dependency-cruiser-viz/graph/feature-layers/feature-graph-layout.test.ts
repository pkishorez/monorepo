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

// Layers in declared order — the swimlane column order passed to the layout.
const LAYER_ORDER = ['a', 'b', 'c'];

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

describe('computeFeatureGraphLayout layer swimlanes', () => {
  it('puts each layer in its own column, in declared order', () => {
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'midX'),
      edge('b', 'midX', 'c', 'leaf'),
    ]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set(), LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('b::midX')).toBe(COL_PITCH);
    expect(xOf('c::leaf')).toBe(2 * COL_PITCH);
  });

  it('columns follow the layer, not import role — a deep source sits right', () => {
    // `leaf` (layer c) imports `entry` (layer a). In a swimlane it stays in its
    // layer's column even though it is the source, so the import reads right →
    // left, surfacing that a deep layer reaches back up. All three layers are
    // present (every module is owned by the feature), so columns are 0/1/2.
    const summary = summaryWith([edge('c', 'leaf', 'a', 'entry')]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set(), LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('c::leaf')).toBe(2 * COL_PITCH);
  });

  it('densifies over present layers, skipping absent ones', () => {
    // A graph touching only layers a and c (no b node) collapses them to
    // adjacent columns 0 and 1 — no empty gap for the skipped layer.
    const onlyAC = {
      ...summaryWith([edge('a', 'entry', 'c', 'leaf')]),
      moduleCoverage: [cov('a', 'entry'), cov('c', 'leaf')],
    };
    const graph = featureModuleGraph(config, onlyAC, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set(), LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('c::leaf')).toBe(COL_PITCH);
  });

  it('marks a legal cycle with kind "cycle" and keeps it in one column', () => {
    // midX ↔ midY (same layer b) import each other. The swimlane keeps both in
    // column 1; the two circular edges are flagged so they render distinctly
    // instead of hiding as innocuous same-column lines.
    const summary = summaryWith([
      edge('a', 'entry', 'b', 'midX'),
      edge('b', 'midX', 'b', 'midY'),
      edge('b', 'midY', 'b', 'midX'),
      edge('b', 'midY', 'c', 'leaf'),
    ]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes, edges } = computeFeatureGraphLayout(
      graph,
      new Set(),
      LAYER_ORDER,
    );
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;
    const kindOf = (from: string, to: string) =>
      (
        edges.find((e) => e.source === from && e.target === to)?.data as
          | { kind?: string }
          | undefined
      )?.kind;

    expect(xOf('b::midX')).toBe(COL_PITCH);
    expect(xOf('b::midY')).toBe(COL_PITCH);
    // Both edges of the 2-cycle are flagged; the acyclic ones are not.
    expect(kindOf('b::midX', 'b::midY')).toBe('cycle');
    expect(kindOf('b::midY', 'b::midX')).toBe('cycle');
    expect(kindOf('a::entry', 'b::midX')).toBe('legal');
    expect(kindOf('b::midY', 'c::leaf')).toBe('legal');
  });

  it('depth mode packs a deep-layer source into column 0', () => {
    // `leaf` (layer c) is a source — nothing imports it — so in depth mode it
    // sits in column 0 even though its layer is last, and `entry` (which it
    // imports) sits one column right. The opposite of layer mode.
    const summary = summaryWith([edge('c', 'leaf', 'a', 'entry')]);
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(
      graph,
      new Set(),
      LAYER_ORDER,
      'depth',
    );
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('c::leaf')).toBe(0);
    expect(xOf('a::entry')).toBe(COL_PITCH);
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
    const { nodes } = computeFeatureGraphLayout(graph, new Set(), LAYER_ORDER);
    const yOf = (key: string) => nodes.find((n) => n.id === key)!.position.y;

    expect(yOf('b::midY')).toBeLessThan(yOf('b::midX'));
  });
});

describe('computeFeatureGraphLayout family clustering', () => {
  const nestedConfig = toVisualizationConfig({
    rootDir: 'src',
    rules: [
      layersTopDown('app', [layer('a', ['src/a']), layer('b', ['src/b'])]),
    ],
    features: [feature('orders', {})],
    modules: [
      module('src/a/entry', { feature: 'orders' }),
      module('src/b/cart', { feature: 'orders' }),
      module('src/b/cart/multi', { feature: 'orders' }),
      module('src/b/other', { feature: 'orders' }),
    ],
  });
  const nestedCov = (
    l: string,
    m: string,
  ): VizSummary['moduleCoverage'][number] => ({
    module: m,
    layer: l,
    feature: 'orders',
    visibility: 'private',
    files: [`src/${l}/${m}.ts`],
  });

  it('stacks a parent and its sub-module tighter than unrelated siblings', () => {
    const summary: VizSummary = {
      ignoredFiles: [],
      violations: [],
      layerOrphanFiles: [],
      coveredFiles: [],
      moduleCoverage: [
        nestedCov('a', 'entry'),
        nestedCov('b', 'cart'),
        nestedCov('b', 'cart/multi'),
        nestedCov('b', 'other'),
      ],
      coverageGaps: [],
      emptyModules: [],
      conflicts: [],
      breaches: [],
      featureEdges: [],
      featureModuleEdges: [],
      moduleEdges: [
        edge('a', 'entry', 'b', 'cart'),
        edge('a', 'entry', 'b', 'other'),
      ],
    };
    const graph = featureModuleGraph(nestedConfig, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, new Set(), ['a', 'b']);
    const yOf = (key: string) => nodes.find((n) => n.id === key)!.position.y;

    // `cart` and `cart/multi` are one family — adjacent and tight.
    const familyGap = Math.abs(yOf('b::cart/multi') - yOf('b::cart'));
    // `other` is a separate family — a full row gap from the cluster.
    const siblingGap = Math.min(
      Math.abs(yOf('b::other') - yOf('b::cart')),
      Math.abs(yOf('b::other') - yOf('b::cart/multi')),
    );
    expect(familyGap).toBeLessThan(siblingGap);
  });
});
