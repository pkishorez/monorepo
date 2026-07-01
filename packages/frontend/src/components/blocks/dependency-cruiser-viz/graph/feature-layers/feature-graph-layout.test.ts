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
  LAYER_GAP,
  MODULE_NODE_WIDTH,
  SUB_COL_GAP,
  computeFeatureGraphLayout,
} from './feature-graph-layout';

const COL_PITCH = MODULE_NODE_WIDTH + COL_GAP;
// Distance from one layer band's first column to the next band's first column.
const BAND_PITCH = COL_PITCH + LAYER_GAP;
// Distance between two internal sub-columns within one layer band.
const SUB_COL_PITCH = MODULE_NODE_WIDTH + SUB_COL_GAP;

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
  features: [
    feature('orders', {
      root: 'entry',
      modules: ['entry', 'entry2', 'midX', 'midY', 'leaf'],
    }),
  ],
  modules: [
    module('src/a/entry'),
    module('src/a/entry2'),
    module('src/b/midX'),
    module('src/b/midY'),
    module('src/c/leaf'),
  ],
});

const cov = (l: string, m: string): VizSummary['moduleCoverage'][number] => ({
  module: m,
  layer: l,
  files: [`src/${l}/${m}.ts`],
});

function summaryWith(
  moduleEdges: VizSummary['moduleEdges'],
  featureGraphEdges: Array<{
    from: string;
    to: string;
    kind: 'legal' | 'breach';
  }> = [],
): VizSummary {
  const nodeKeys = ['a::entry', 'a::entry2', 'b::midX', 'b::midY', 'c::leaf'];
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
    moduleEdges,
    featureGraphs: [
      {
        feature: 'orders',
        root: 'a::entry',
        nodes: nodeKeys,
        edges: featureGraphEdges,
      },
    ],
    closureViolations: [],
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

const fgEdge = (
  from: string,
  to: string,
  kind: 'legal' | 'breach' = 'legal',
) => ({ from, to, kind });

describe('computeFeatureGraphLayout layer swimlanes', () => {
  it('puts each layer in its own column, in declared order', () => {
    const summary = summaryWith(
      [edge('a', 'entry', 'b', 'midX'), edge('b', 'midX', 'c', 'leaf')],
      [fgEdge('a::entry', 'b::midX'), fgEdge('b::midX', 'c::leaf')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('b::midX')).toBe(BAND_PITCH);
    expect(xOf('c::leaf')).toBe(2 * BAND_PITCH);
  });

  it('columns follow the layer, not import role — a deep source sits right', () => {
    const summary = summaryWith(
      [edge('c', 'leaf', 'a', 'entry')],
      [fgEdge('c::leaf', 'a::entry')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('c::leaf')).toBe(2 * BAND_PITCH);
  });

  it('densifies over present layers, skipping absent ones', () => {
    const onlyAC: VizSummary = {
      ignoredFiles: [],
      violations: [],
      layerOrphanFiles: [],
      coveredFiles: [],
      moduleCoverage: [cov('a', 'entry'), cov('c', 'leaf')],
      coverageGaps: [],
      emptyModules: [],
      conflicts: [],
      moduleEdges: [edge('a', 'entry', 'c', 'leaf')],
      featureGraphs: [
        {
          feature: 'orders',
          root: 'a::entry',
          nodes: ['a::entry', 'c::leaf'],
          edges: [fgEdge('a::entry', 'c::leaf')],
        },
      ],
      closureViolations: [],
    };
    const graph = featureModuleGraph(config, onlyAC, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('a::entry')).toBe(0);
    expect(xOf('c::leaf')).toBe(BAND_PITCH);
  });

  it('condenses a same-layer cycle into one column without flagging it', () => {
    const summary = summaryWith(
      [
        edge('a', 'entry', 'b', 'midX'),
        edge('b', 'midX', 'b', 'midY'),
        edge('b', 'midY', 'b', 'midX'),
        edge('b', 'midY', 'c', 'leaf'),
      ],
      [
        fgEdge('a::entry', 'b::midX'),
        fgEdge('b::midX', 'b::midY'),
        fgEdge('b::midY', 'b::midX'),
        fgEdge('b::midY', 'c::leaf'),
      ],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes, edges } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;
    const kindOf = (from: string, to: string) =>
      (
        edges.find((e) => e.source === from && e.target === to)?.data as
          | { kind?: string }
          | undefined
      )?.kind;

    // The cycle is condensed to one sub-column (same x), not flagged: its
    // same-layer edges read as plain peers, cross-layer ones as legal.
    expect(xOf('b::midX')).toBe(BAND_PITCH);
    expect(xOf('b::midY')).toBe(BAND_PITCH);
    expect(kindOf('b::midX', 'b::midY')).toBe('peer');
    expect(kindOf('b::midY', 'b::midX')).toBe('peer');
    expect(kindOf('a::entry', 'b::midX')).toBe('legal');
    expect(kindOf('b::midY', 'c::leaf')).toBe('legal');
  });

  it('depth mode packs a deep-layer source into column 0', () => {
    const summary = summaryWith(
      [edge('c', 'leaf', 'a', 'entry')],
      [fgEdge('c::leaf', 'a::entry')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER, 'depth');
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    expect(xOf('c::leaf')).toBe(0);
    expect(xOf('a::entry')).toBe(COL_PITCH);
  });

  it('reorders a column so children line up under their parents', () => {
    const summary = summaryWith(
      [edge('a', 'entry', 'b', 'midY'), edge('a', 'entry2', 'b', 'midX')],
      [fgEdge('a::entry', 'b::midY'), fgEdge('a::entry2', 'b::midX')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const yOf = (key: string) => nodes.find((n) => n.id === key)!.position.y;

    expect(yOf('b::midY')).toBeLessThan(yOf('b::midX'));
  });
});

describe('computeFeatureGraphLayout transitive reduction', () => {
  const hasEdge = (
    edges: ReturnType<typeof computeFeatureGraphLayout>['edges'],
    from: string,
    to: string,
  ) => edges.some((e) => e.source === from && e.target === to);

  it('drops a diamond edge implied by a longer path (reduced), keeps it (all)', () => {
    // entry → midX → leaf and entry → midY → leaf, plus the direct entry → leaf.
    const summary = summaryWith(
      [
        edge('a', 'entry', 'b', 'midX'),
        edge('a', 'entry', 'b', 'midY'),
        edge('b', 'midX', 'c', 'leaf'),
        edge('b', 'midY', 'c', 'leaf'),
        edge('a', 'entry', 'c', 'leaf'),
      ],
      [
        fgEdge('a::entry', 'b::midX'),
        fgEdge('a::entry', 'b::midY'),
        fgEdge('b::midX', 'c::leaf'),
        fgEdge('b::midY', 'c::leaf'),
        fgEdge('a::entry', 'c::leaf'),
      ],
    );
    const graph = featureModuleGraph(config, summary, 'orders');

    const reduced = computeFeatureGraphLayout(graph, LAYER_ORDER, 'layer');
    expect(hasEdge(reduced.edges, 'a::entry', 'c::leaf')).toBe(false);
    expect(hasEdge(reduced.edges, 'a::entry', 'b::midX')).toBe(true);
    expect(hasEdge(reduced.edges, 'b::midX', 'c::leaf')).toBe(true);
    expect(reduced.hiddenCount).toBe(1);

    const all = computeFeatureGraphLayout(graph, LAYER_ORDER, 'layer', 'all');
    expect(hasEdge(all.edges, 'a::entry', 'c::leaf')).toBe(true);
    expect(all.hiddenCount).toBe(0);
  });

  it('keeps a direct edge when it is the only path', () => {
    const summary = summaryWith(
      [edge('a', 'entry', 'c', 'leaf')],
      [fgEdge('a::entry', 'c::leaf')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { edges, hiddenCount } = computeFeatureGraphLayout(
      graph,
      LAYER_ORDER,
      'layer',
    );
    expect(hasEdge(edges, 'a::entry', 'c::leaf')).toBe(true);
    expect(hiddenCount).toBe(0);
  });

  it('never hides a breach edge, even when a legal path exists', () => {
    const summary = summaryWith(
      [
        edge('a', 'entry', 'b', 'midX'),
        edge('b', 'midX', 'c', 'leaf'),
        edge('a', 'entry', 'c', 'leaf', 'breach'),
      ],
      [
        fgEdge('a::entry', 'b::midX'),
        fgEdge('b::midX', 'c::leaf'),
        fgEdge('a::entry', 'c::leaf', 'breach'),
      ],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { edges, hiddenCount } = computeFeatureGraphLayout(
      graph,
      LAYER_ORDER,
      'layer',
    );
    expect(hasEdge(edges, 'a::entry', 'c::leaf')).toBe(true);
    expect(hiddenCount).toBe(0);
  });

  it('keeps both edges of a legal cycle (intra-SCC is never reduced)', () => {
    const summary = summaryWith(
      [edge('b', 'midX', 'b', 'midY'), edge('b', 'midY', 'b', 'midX')],
      [fgEdge('b::midX', 'b::midY'), fgEdge('b::midY', 'b::midX')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { edges, hiddenCount } = computeFeatureGraphLayout(
      graph,
      LAYER_ORDER,
      'layer',
    );
    expect(hasEdge(edges, 'b::midX', 'b::midY')).toBe(true);
    expect(hasEdge(edges, 'b::midY', 'b::midX')).toBe(true);
    expect(hiddenCount).toBe(0);
  });
});

describe('computeFeatureGraphLayout swimlane bands & peers', () => {
  const dataKind = (
    edges: ReturnType<typeof computeFeatureGraphLayout>['edges'],
    from: string,
    to: string,
  ) =>
    (
      edges.find((e) => e.source === from && e.target === to)?.data as
        | { kind?: string }
        | undefined
    )?.kind;

  it('spreads a same-layer peer import into the next sub-column, styled peer', () => {
    // midX imports midY, both in layer b — a cross-family intra-layer edge.
    const summary = summaryWith(
      [edge('b', 'midX', 'b', 'midY')],
      [fgEdge('b::midX', 'b::midY')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes, edges } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const xOf = (key: string) => nodes.find((n) => n.id === key)!.position.x;

    // The imported peer sits one sub-column to the right, inside the same band.
    expect(xOf('b::midY') - xOf('b::midX')).toBe(SUB_COL_PITCH);
    expect(dataKind(edges, 'b::midX', 'b::midY')).toBe('peer');
  });

  it('emits one highlighted band per present layer', () => {
    const summary = summaryWith(
      [edge('a', 'entry', 'b', 'midX'), edge('b', 'midX', 'c', 'leaf')],
      [fgEdge('a::entry', 'b::midX'), fgEdge('b::midX', 'c::leaf')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER);
    const bands = nodes.filter((n) => n.type === 'layer-band').map((n) => n.id);
    expect(bands.sort()).toEqual(['band::a', 'band::b', 'band::c']);
  });

  it('compact mode draws no bands', () => {
    const summary = summaryWith(
      [edge('a', 'entry', 'b', 'midX')],
      [fgEdge('a::entry', 'b::midX')],
    );
    const graph = featureModuleGraph(config, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, LAYER_ORDER, 'depth');
    expect(nodes.some((n) => n.type === 'layer-band')).toBe(false);
  });
});

describe('computeFeatureGraphLayout family clustering', () => {
  const nestedConfig = toVisualizationConfig({
    rootDir: 'src',
    rules: [
      layersTopDown('app', [layer('a', ['src/a']), layer('b', ['src/b'])]),
    ],
    features: [
      feature('orders', {
        root: 'entry',
        modules: ['entry', 'cart', 'cart/multi', 'other'],
      }),
    ],
    modules: [
      module('src/a/entry'),
      module('src/b/cart'),
      module('src/b/cart/multi'),
      module('src/b/other'),
    ],
  });
  const nestedCov = (
    l: string,
    m: string,
  ): VizSummary['moduleCoverage'][number] => ({
    module: m,
    layer: l,
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
      moduleEdges: [
        edge('a', 'entry', 'b', 'cart'),
        edge('a', 'entry', 'b', 'other'),
      ],
      featureGraphs: [
        {
          feature: 'orders',
          root: 'a::entry',
          nodes: ['a::entry', 'b::cart', 'b::cart/multi', 'b::other'],
          edges: [
            fgEdge('a::entry', 'b::cart'),
            fgEdge('a::entry', 'b::other'),
          ],
        },
      ],
      closureViolations: [],
    };
    const graph = featureModuleGraph(nestedConfig, summary, 'orders');
    const { nodes } = computeFeatureGraphLayout(graph, ['a', 'b']);
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

  it('hides a family-internal parent → child edge as cluster-implied noise', () => {
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
      moduleEdges: [edge('b', 'cart', 'b', 'cart/multi')],
      featureGraphs: [
        {
          feature: 'orders',
          root: 'a::entry',
          nodes: ['a::entry', 'b::cart', 'b::cart/multi', 'b::other'],
          edges: [fgEdge('b::cart', 'b::cart/multi')],
        },
      ],
      closureViolations: [],
    };
    const graph = featureModuleGraph(nestedConfig, summary, 'orders');
    const { edges, hiddenCount } = computeFeatureGraphLayout(graph, ['a', 'b']);

    expect(
      edges.some((e) => e.source === 'b::cart' && e.target === 'b::cart/multi'),
    ).toBe(false);
    expect(hiddenCount).toBe(1);
  });
});
