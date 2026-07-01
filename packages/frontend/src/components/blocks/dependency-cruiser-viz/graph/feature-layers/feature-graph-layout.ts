import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { FeatureModuleGraph } from '../../model';
import { moduleFamily, type ModuleNode } from '../../model';

export type ModuleGraphNodeData = {
  module: ModuleNode;
  /** Named by ≥2 features (emergent sharing). */
  isShared: boolean;
  /** Re-export fan-out point; exempt from closure enforcement. */
  barrel: boolean;
};

export type ModuleEdgeData = {
  kind: 'legal' | 'breach' | 'peer';
};

/** Background swimlane band drawn behind one layer's internal sub-columns. */
export type LayerBandNodeData = {
  layer: string;
};

export const MODULE_NODE_WIDTH = 180;
export const MODULE_NODE_HEIGHT = 52;
export const LEGAL_EDGE_COLOR = '#94a3b8';
export const BREACH_EDGE_COLOR = '#ef4444';
/**
 * Same-layer (intra-column) legal imports — indigo, dotted. Distinct from the
 * slate cross-layer flow so a peer import routed over the column is never read
 * as a backward, flow-violating edge.
 */
export const PEER_EDGE_COLOR = '#818cf8';
/** Horizontal gap between layer columns. */
export const COL_GAP = 140;
/** Vertical gap between modules stacked within a column. */
export const ROW_GAP = 60;
/** Tight gap between a parent module and its nested sub-modules (one cluster). */
export const FAMILY_ROW_GAP = 10;
/** Horizontal gap between internal depth sub-columns *within* one layer band. */
export const SUB_COL_GAP = 100;
/** Extra horizontal gap at a boundary between two layer bands. */
export const LAYER_GAP = 220;
/** Padding of a swimlane band around its modules (top leaves room for a label). */
export const BAND_PAD_X = 26;
export const BAND_PAD_TOP = 40;
export const BAND_PAD_BOTTOM = 26;

const COL_PITCH = MODULE_NODE_WIDTH + COL_GAP;
const SUB_COL_PITCH = MODULE_NODE_WIDTH + SUB_COL_GAP;

/** A layer's swimlane band, in graph coordinates (before band padding). */
type LayerBand = { layer: string; x: number; width: number };

/**
 * How nodes map to columns for one layout mode: the per-node column, the total
 * column count, each column's x position, and the swimlane bands to draw
 * behind them (empty in compact mode).
 */
type ColumnPlan = {
  colOf: (m: ModuleNode) => number;
  colCount: number;
  colX: number[];
  bands: LayerBand[];
};

/** Which rule assigns a node to a column. */
export type ColumnMode = 'layer' | 'depth';

/**
 * Which legal edges to draw. `'reduced'` (default) hides edges implied by a
 * longer legal path — the transitive reduction — collapsing the hairball to its
 * dependency spine; `'all'` draws every real import edge. Breach edges and edges
 * inside a cycle are always drawn either way.
 */
export type EdgeMode = 'reduced' | 'all';

/**
 * Lay a feature's module graph left → right in columns, either way reading as
 * the feature's end-to-end import flow. `columnMode` chooses the rule:
 *
 * - `'layer'` (swimlanes): each column is one architecture layer in
 *   `layerOrder` (handlers → orchestrators → … → infrastructure), dense over
 *   the layers present. A breach visibly swims *against* the current.
 * - `'depth'` (compact): each node sits one column past the deepest module that
 *   imports it (longest legal-import chain), so sources pack into column 0 and
 *   the graph is as narrow as the dependencies allow. Cyclic imports are
 *   condensed (every node of a strongly-connected component shares a column) so
 *   they cannot inflate the span — but they are not flagged visually; real
 *   cycles are the lint's job, not the graph's.
 *
 * Within a column, modules are ordered vertically by a barycenter sweep, and a
 * parent and its nested sub-modules cluster tight. Shared modules carry an amber
 * tint; barrel modules render with a dashed border. Breach edges read red/
 * dashed, same-layer peer edges indigo/dotted, legal edges slate.
 */
export function computeFeatureGraphLayout(
  graph: FeatureModuleGraph,
  layerOrder: readonly string[],
  columnMode: ColumnMode = 'layer',
  edgeMode: EdgeMode = 'reduced',
): {
  nodes: Node[];
  edges: Edge[];
  /** Legal edges hidden as redundant/family-internal (0 in 'all' + no families). */
  hiddenCount: number;
} {
  const plan =
    columnMode === 'depth'
      ? uniformDepthColumns(graph)
      : layerBandColumns(graph, layerOrder);
  const colOf = plan.colOf;

  // Group nodes into columns, keeping graph order as the initial within-column
  // order. `columns` is dense and 0-indexed by column number.
  const columns: ModuleNode[][] = Array.from(
    { length: plan.colCount },
    () => [],
  );
  for (const m of graph.nodes) columns[colOf(m)]!.push(m);

  orderColumnsByBarycenter(columns, graph.edges);

  // Keep a parent and its nested sub-modules adjacent within the column so they
  // read as one clustered unit (their internal edges are dropped as noise).
  const clustered = columns.map(clusterColumnByFamily);

  // Per-column vertical offsets: members of one family sit a tight gap apart,
  // separate families a full gap apart. Center every column on a shared midline
  // by its real height so uneven columns stay balanced.
  const layouts = clustered.map(columnLayout);
  const tallest = layouts.reduce((mx, l) => Math.max(mx, l.height), 0);

  const positionByKey = new Map<string, { x: number; y: number }>();
  clustered.forEach((col, colIndex) => {
    const { offsets, height } = layouts[colIndex]!;
    const top = (tallest - height) / 2;
    col.forEach((m, rowIndex) => {
      positionByKey.set(m.key, {
        x: plan.colX[colIndex]!,
        y: top + offsets[rowIndex]!,
      });
    });
  });

  const moduleNodes: Node<ModuleGraphNodeData>[] = graph.nodes.map((m) => ({
    id: m.key,
    type: 'module',
    position: positionByKey.get(m.key) ?? { x: 0, y: 0 },
    data: { module: m, isShared: m.isShared, barrel: m.barrel },
    draggable: false,
  }));

  // Highlighted swimlane bands sit behind the modules so a layer reads as one
  // region even though its members spread across internal depth sub-columns.
  const bandNodes: Node<LayerBandNodeData>[] = plan.bands.map((b) => ({
    id: `band::${b.layer}`,
    type: 'layer-band',
    position: { x: b.x - BAND_PAD_X, y: -BAND_PAD_TOP },
    data: { layer: b.layer },
    style: {
      width: b.width + BAND_PAD_X * 2,
      height: tallest + BAND_PAD_TOP + BAND_PAD_BOTTOM,
    },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -1,
  }));

  const nodes: Node[] = [...bandNodes, ...moduleNodes];

  // Column assignment and the barycenter sweep above always run over the FULL
  // legal edge set, so hiding edges never degrades the layout. Only the rendered
  // edges are filtered/classified here.
  const nodeByKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const structuralNesting = (from: string, to: string): boolean => {
    const a = nodeByKey.get(from);
    const b = nodeByKey.get(to);
    return a != null && b != null && isStructuralNesting(a, b);
  };
  const sameLayer = (a: string, b: string): boolean => {
    const na = nodeByKey.get(a);
    const nb = nodeByKey.get(b);
    return na != null && nb != null && na.layer === nb.layer;
  };
  // Cycles are a lint concern, not a visual one (they are mostly barrel-within-
  // a-layer artifacts), so they are NOT flagged here — an edge is just breach,
  // same-layer peer, or plain legal.
  const kindOf = (
    e: FeatureModuleGraph['edges'][number],
  ): ModuleEdgeData['kind'] =>
    e.kind === 'breach' ? 'breach' : sameLayer(e.from, e.to) ? 'peer' : 'legal';

  const redundant =
    edgeMode === 'reduced' ? redundantLegalEdgeKeys(graph) : null;
  const visibleGraphEdges = graph.edges.filter((e) => {
    const key = `${e.from}\0${e.to}`;
    // Transitive reduction: drop legal edges implied by a longer legal path.
    if (redundant && redundant.has(key)) return false;
    const kind = kindOf(e);
    // Structural parent→child nesting (under a non-barrel) is implied by the
    // cluster that already draws the family together — drop it as noise. Sibling
    // edges and barrel fan-out are real wiring and kept.
    if (
      (kind === 'legal' || kind === 'peer') &&
      structuralNesting(e.from, e.to)
    ) {
      return false;
    }
    return true;
  });
  const hiddenCount = graph.edges.length - visibleGraphEdges.length;

  const edges: Edge[] = visibleGraphEdges.map((e, i) => {
    const kind = kindOf(e);
    // A breach "swims against the current" — animated, dashed, bold.
    const isBreach = kind === 'breach';
    const color = isBreach
      ? BREACH_EDGE_COLOR
      : kind === 'peer'
        ? PEER_EDGE_COLOR
        : LEGAL_EDGE_COLOR;
    // Peer (same-layer) edges read as dotted indigo so an in-band hop is never
    // mistaken for cross-layer flow.
    const dash = isBreach ? '6 3' : kind === 'peer' ? '1 4' : undefined;
    return {
      id: `${e.from}->${e.to}:${kind}:${i}`,
      source: e.from,
      target: e.to,
      // Built-in soft bézier; the panel restyles it on hover/selection.
      type: 'simplebezier',
      // No invisible interaction overlay — it would sit above nodes and steal
      // pointer events, causing the hovered node to flicker enter/leave.
      interactionWidth: 0,
      selectable: false,
      focusable: false,
      animated: isBreach,
      data: { kind },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: isBreach ? 2 : kind === 'peer' ? 1.25 : 1.5,
        ...(dash ? { strokeDasharray: dash } : {}),
      },
    };
  });

  return { nodes, edges, hiddenCount };
}

/**
 * Keys (`from\0to`) of legal edges that are redundant under transitive
 * reduction: their endpoints are already connected by a longer legal path, so
 * the direct edge adds no reachability. Strongly-connected components are
 * condensed first (Tarjan) and only cross-component edges are candidates — an
 * intra-cycle edge is never dropped (that would erase a real circular import).
 * An edge `u→v` is redundant iff, over the condensation DAG, `v`'s component is
 * still reachable from `u`'s component without traversing the direct edge.
 */
function redundantLegalEdgeKeys(graph: FeatureModuleGraph): Set<string> {
  const present = new Set(graph.nodes.map((n) => n.key));
  const legal = graph.edges.filter(
    (e) => e.kind === 'legal' && present.has(e.from) && present.has(e.to),
  );
  const sccOf = stronglyConnectedComponents(graph.nodes, legal);

  // Condensation adjacency over cross-component legal edges (deduped).
  const successors = new Map<number, Set<number>>();
  for (const e of legal) {
    const from = sccOf.get(e.from)!;
    const to = sccOf.get(e.to)!;
    if (from === to) continue;
    (successors.get(from) ?? successors.set(from, new Set()).get(from)!).add(
      to,
    );
  }

  // Is `target` reachable from `from` over the condensation WITHOUT using the
  // direct `from→target` edge? BFS that skips only that one edge.
  const reachableWithoutDirect = (from: number, target: number): boolean => {
    const queue: number[] = [from];
    const seen = new Set<number>([from]);
    while (queue.length > 0) {
      const comp = queue.shift()!;
      for (const next of successors.get(comp) ?? []) {
        if (comp === from && next === target) continue; // skip the direct edge
        if (next === target) return true;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  };

  const keys = new Set<string>();
  for (const e of legal) {
    const from = sccOf.get(e.from)!;
    const to = sccOf.get(e.to)!;
    if (from === to) continue; // intra-cycle edge — always kept
    if (reachableWithoutDirect(from, to)) keys.add(`${e.from}\0${e.to}`);
  }
  return keys;
}

/**
 * Reorder a column so a parent module and its nested sub-modules form one
 * contiguous run, keeping the barycenter-derived family order (a family's slot
 * is where its first member already sits). Within a family the parent (shorter
 * name) leads, then sub-modules alphabetically.
 */
function clusterColumnByFamily(col: ModuleNode[]): ModuleNode[] {
  const families = new Map<string, ModuleNode[]>();
  const order: string[] = [];
  for (const m of col) {
    const family = moduleFamily(m.layer, m.name);
    if (!families.has(family)) {
      families.set(family, []);
      order.push(family);
    }
    families.get(family)!.push(m);
  }
  for (const family of order) {
    families
      .get(family)!
      .sort(
        (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name),
      );
  }
  return order.flatMap((family) => families.get(family)!);
}

/**
 * Vertical offset of each node in a (family-clustered) column: a tight gap
 * between members of the same family, a full gap between families. Returns the
 * per-row offsets and the column's total height for midline centering.
 */
function columnLayout(col: ModuleNode[]): {
  offsets: number[];
  height: number;
} {
  const offsets: number[] = [];
  let y = 0;
  col.forEach((m, i) => {
    if (i > 0) {
      const sameFamily =
        moduleFamily(col[i - 1]!.layer, col[i - 1]!.name) ===
        moduleFamily(m.layer, m.name);
      y += MODULE_NODE_HEIGHT + (sameFamily ? FAMILY_ROW_GAP : ROW_GAP);
    }
    offsets.push(y);
  });
  return { offsets, height: col.length > 0 ? y + MODULE_NODE_HEIGHT : 0 };
}

/**
 * Longest-path rank of each node over a DAG of the given edges, with strongly-
 * connected components condensed first (every node of a cycle shares one rank,
 * over the acyclic condensation). A source (no inbound edge) ranks 0; each edge
 * pushes its target at least one rank to the right.
 */
function condensedLongestPath(
  nodes: ModuleNode[],
  edges: FeatureModuleGraph['edges'],
): Map<string, number> {
  const sccOf = stronglyConnectedComponents(nodes, edges);

  const successors = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  for (const comp of sccOf.values()) {
    if (!successors.has(comp)) {
      successors.set(comp, new Set());
      indegree.set(comp, 0);
    }
  }
  for (const e of edges) {
    const from = sccOf.get(e.from)!;
    const to = sccOf.get(e.to)!;
    if (from === to || successors.get(from)!.has(to)) continue;
    successors.get(from)!.add(to);
    indegree.set(to, indegree.get(to)! + 1);
  }

  // Longest path over the condensation DAG via Kahn topological relaxation.
  const compRank = new Map([...indegree.keys()].map((c) => [c, 0]));
  const queue = [...indegree.keys()].filter((c) => indegree.get(c) === 0);
  while (queue.length > 0) {
    const c = queue.shift()!;
    for (const d of successors.get(c)!) {
      if (compRank.get(c)! + 1 > compRank.get(d)!) {
        compRank.set(d, compRank.get(c)! + 1);
      }
      indegree.set(d, indegree.get(d)! - 1);
      if (indegree.get(d) === 0) queue.push(d);
    }
  }

  const rank = new Map<string, number>();
  for (const n of nodes) rank.set(n.key, compRank.get(sccOf.get(n.key)!) ?? 0);
  return rank;
}

/**
 * Compact mode: one column per import-depth over the whole legal graph, so
 * sources pack into column 0 and the graph is as narrow as the dependencies
 * allow. No swimlane bands.
 */
function uniformDepthColumns(graph: FeatureModuleGraph): ColumnPlan {
  const present = new Set(graph.nodes.map((n) => n.key));
  const legal = graph.edges.filter(
    (e) => e.kind === 'legal' && present.has(e.from) && present.has(e.to),
  );
  const rank = condensedLongestPath(graph.nodes, legal);
  const colOf = (m: ModuleNode) => rank.get(m.key) ?? 0;
  const colCount = graph.nodes.reduce((mx, m) => Math.max(mx, colOf(m)), 0) + 1;
  const colX = Array.from({ length: colCount }, (_, i) => i * COL_PITCH);
  return { colOf, colCount, colX, bands: [] };
}

/**
 * A structural parent→child nesting edge: same layer and one module's name is a
 * path-prefix of the other (e.g. `otel` → `otel/internal`), where the parent is
 * NOT a barrel. This is the implicit containment a family cluster already
 * conveys, so it is excluded from both edge rendering and intra-layer depth —
 * nested children keep their parent's sub-column and cluster with it. Sibling
 * edges (neither name prefixes the other) and barrel fan-out are real wiring:
 * they are drawn AND push sub-depth so they flow forward within the band.
 */
function isStructuralNesting(a: ModuleNode, b: ModuleNode): boolean {
  if (a.layer !== b.layer) return false;
  const parent = b.name.startsWith(a.name + '/')
    ? a
    : a.name.startsWith(b.name + '/')
      ? b
      : null;
  return parent != null && !parent.barrel;
}

/**
 * Internal depth of each node *within its own layer*: the longest chain of
 * same-layer legal imports reaching it, excluding only {@link isStructuralNesting}
 * edges so a non-barrel parent and its nested children keep one sub-column.
 * Sibling and barrel-fan-out edges DO advance the depth, so intra-layer wiring
 * spreads left → right; same-layer cycles are condensed to one sub-column.
 */
function intraLayerSubDepth(graph: FeatureModuleGraph): Map<string, number> {
  const nodeByKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const present = new Set(graph.nodes.map((n) => n.key));
  const intraLayer = graph.edges.filter((e) => {
    if (e.kind !== 'legal') return false;
    if (!present.has(e.from) || !present.has(e.to)) return false;
    const a = nodeByKey.get(e.from);
    const b = nodeByKey.get(e.to);
    if (!a || !b || a.layer !== b.layer) return false;
    return !isStructuralNesting(a, b);
  });
  return condensedLongestPath(graph.nodes, intraLayer);
}

/**
 * Layers mode: each layer is a highlighted swimlane band, and within a band its
 * modules spread left → right by internal import depth so intra-layer edges also
 * flow forward (a clear intra-layer root sits in the band's first sub-column).
 * Bands are laid out in `layerOrder`, densified over present layers; only real
 * breaches ever swim backward across a band.
 */
function layerBandColumns(
  graph: FeatureModuleGraph,
  layerOrder: readonly string[],
): ColumnPlan {
  const orderIndex = new Map(layerOrder.map((name, i) => [name, i]));
  const rankOf = (layer: string) => orderIndex.get(layer) ?? layerOrder.length;
  const presentLayers = [...new Set(graph.nodes.map((n) => n.layer))].sort(
    (a, b) => rankOf(a) - rankOf(b),
  );
  const layerRank = new Map(presentLayers.map((layer, i) => [layer, i]));

  const subDepth = intraLayerSubDepth(graph);
  const maxSubByLayer = new Map<number, number>();
  for (const n of graph.nodes) {
    const lr = layerRank.get(n.layer) ?? 0;
    const sd = subDepth.get(n.key) ?? 0;
    maxSubByLayer.set(lr, Math.max(maxSubByLayer.get(lr) ?? 0, sd));
  }

  // Each layer contributes (maxSub + 1) contiguous global columns.
  const layerColStart = new Map<number, number>();
  let running = 0;
  for (let lr = 0; lr < presentLayers.length; lr++) {
    layerColStart.set(lr, running);
    running += (maxSubByLayer.get(lr) ?? 0) + 1;
  }
  const colCount = Math.max(1, running);

  const colOf = (m: ModuleNode) => {
    const lr = layerRank.get(m.layer) ?? 0;
    return (layerColStart.get(lr) ?? 0) + (subDepth.get(m.key) ?? 0);
  };

  // x per column: a wide LAYER_GAP at each band boundary, a tight SUB_COL_GAP
  // between a layer's internal sub-columns.
  const firstColOfLayer = new Set(layerColStart.values());
  const colX: number[] = [];
  let x = 0;
  for (let c = 0; c < colCount; c++) {
    if (c > 0) {
      x += firstColOfLayer.has(c) ? COL_PITCH + LAYER_GAP : SUB_COL_PITCH;
    }
    colX.push(x);
  }

  const bands: LayerBand[] = presentLayers.map((layer, lr) => {
    const start = layerColStart.get(lr)!;
    const end = start + (maxSubByLayer.get(lr) ?? 0);
    const left = colX[start]!;
    const right = colX[end]! + MODULE_NODE_WIDTH;
    return { layer, x: left, width: right - left };
  });

  return { colOf, colCount, colX, bands };
}

/**
 * Tarjan's strongly-connected-components, iterative (the call stack would
 * otherwise bound graph depth). Returns each node key → its component id;
 * acyclic nodes are singleton components.
 */
function stronglyConnectedComponents(
  nodes: ModuleNode[],
  edges: FeatureModuleGraph['edges'],
): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) adjacency.set(n.key, []);
  for (const e of edges) adjacency.get(e.from)!.push(e.to);

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const component = new Map<string, number>();
  let counter = 0;
  let nextComponent = 0;

  for (const n of nodes) {
    if (index.has(n.key)) continue;
    const work: Array<{ v: string; i: number }> = [{ v: n.key, i: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const v = frame.v;
      if (frame.i === 0) {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
      }
      const neighbours = adjacency.get(v)!;
      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i]!;
        frame.i++;
        if (!index.has(w)) {
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
      } else {
        if (low.get(v) === index.get(v)) {
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            component.set(w, nextComponent);
            if (w === v) break;
          }
          nextComponent++;
        }
        work.pop();
        const parent = work[work.length - 1];
        if (parent) {
          low.set(parent.v, Math.min(low.get(parent.v)!, low.get(v)!));
        }
      }
    }
  }
  return component;
}

/**
 * Reorder modules within each column to reduce edge crossings, mutating
 * `columns` in place. Standard barycenter heuristic: a few alternating
 * left→right / right→left sweeps where each node is pulled toward the mean
 * position of its neighbours in the adjacent column. Edges within the same
 * column don't constrain ordering and are ignored here.
 */
function orderColumnsByBarycenter(
  columns: ModuleNode[][],
  edges: FeatureModuleGraph['edges'],
): void {
  // Adjacency by node key, split by direction so a sweep only consults the
  // column it is reading from.
  const targetsOf = new Map<string, string[]>();
  const sourcesOf = new Map<string, string[]>();
  for (const e of edges) {
    (targetsOf.get(e.from) ?? targetsOf.set(e.from, []).get(e.from)!).push(
      e.to,
    );
    (sourcesOf.get(e.to) ?? sourcesOf.set(e.to, []).get(e.to)!).push(e.from);
  }

  const PASSES = 4;
  for (let pass = 0; pass < PASSES; pass++) {
    const leftToRight = pass % 2 === 0;
    const order = leftToRight
      ? [...columns.keys()]
      : [...columns.keys()].reverse();

    for (const col of order) {
      // The first column in a sweep has no reference column; skip it.
      const refCol = leftToRight ? col - 1 : col + 1;
      if (refCol < 0 || refCol >= columns.length) continue;

      const refIndex = new Map<string, number>();
      columns[refCol]!.forEach((m, i) => refIndex.set(m.key, i));
      const neighbours = leftToRight ? sourcesOf : targetsOf;

      const withBary = columns[col]!.map((m, i) => {
        const keys = neighbours.get(m.key) ?? [];
        const indices = keys
          .map((k) => refIndex.get(k))
          .filter((x): x is number => x !== undefined);
        const bary =
          indices.length > 0
            ? indices.reduce((a, b) => a + b, 0) / indices.length
            : // No neighbours in the reference column → keep current position.
              i;
        return { m, bary, i };
      });

      // Stable sort: ties (incl. neighbourless nodes) keep prior order.
      withBary.sort((a, b) => a.bary - b.bary || a.i - b.i);
      columns[col] = withBary.map((x) => x.m);
    }
  }
}
