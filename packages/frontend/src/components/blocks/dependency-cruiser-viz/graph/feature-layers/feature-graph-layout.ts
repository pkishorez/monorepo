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
  kind: 'legal' | 'breach' | 'cycle';
};

export const MODULE_NODE_WIDTH = 180;
export const MODULE_NODE_HEIGHT = 52;
export const LEGAL_EDGE_COLOR = '#94a3b8';
export const BREACH_EDGE_COLOR = '#ef4444';
/** Cycle (legal-but-circular) imports — amber, distinct from slate/red. */
export const CYCLE_EDGE_COLOR = '#f59e0b';
/** Horizontal gap between layer columns. */
export const COL_GAP = 140;
/** Vertical gap between modules stacked within a column. */
export const ROW_GAP = 60;
/** Tight gap between a parent module and its nested sub-modules (one cluster). */
export const FAMILY_ROW_GAP = 10;

const COL_PITCH = MODULE_NODE_WIDTH + COL_GAP;

/** Which rule assigns a node to a column. */
export type ColumnMode = 'layer' | 'depth';

/**
 * Lay a feature's module graph left → right in columns, either way reading as
 * the feature's end-to-end import flow. `columnMode` chooses the rule:
 *
 * - `'layer'` (swimlanes): each column is one architecture layer in
 *   `layerOrder` (handlers → orchestrators → … → infrastructure), dense over
 *   the layers present. A breach or same-layer cycle visibly swims *against*
 *   the current. Cycle-proof by construction — a cycle sits in one column.
 * - `'depth'` (compact): each node sits one column past the deepest module that
 *   imports it (longest legal-import chain), so sources pack into column 0 and
 *   the graph is as narrow as the dependencies allow. Legal cycles are
 *   condensed (every node of a cycle shares a column) so they cannot inflate
 *   the span.
 *
 * Within a column, modules are ordered vertically by a barycenter sweep, and a
 * parent and its nested sub-modules cluster tight. Cycle edges are marked so
 * they render distinctly rather than hiding the problem. Shared modules carry
 * an amber tint; barrel modules render with a dashed border. Breach edges read
 * red/dashed, cycle edges amber, legal edges slate.
 */
export function computeFeatureGraphLayout(
  graph: FeatureModuleGraph,
  layerOrder: readonly string[],
  columnMode: ColumnMode = 'layer',
): { nodes: Node<ModuleGraphNodeData>[]; edges: Edge[] } {
  const colOf =
    columnMode === 'depth'
      ? depthColumnOf(graph)
      : layerColumnOf(graph, layerOrder);

  // Group nodes into columns, keeping graph order as the initial within-column
  // order. `columns` is dense and 0-indexed by column number.
  const maxCol = graph.nodes.reduce((mx, m) => Math.max(mx, colOf(m)), 0);
  const columns: ModuleNode[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const m of graph.nodes) columns[colOf(m)]!.push(m);

  orderColumnsByBarycenter(columns, graph.edges);

  // Keep a parent and its nested sub-modules adjacent within the column so they
  // read as one clustered unit (they carry no edges between them).
  const clustered = columns.map(clusterColumnByFamily);

  // Edges that close a legal cycle: both endpoints in the same strongly-
  // connected component (over legal edges) of size > 1. Marked so they render
  // distinctly instead of silently collapsing into the layer column.
  const cycleEdges = cycleEdgeKeys(graph);

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
        x: colIndex * COL_PITCH,
        y: top + offsets[rowIndex]!,
      });
    });
  });

  const nodes: Node<ModuleGraphNodeData>[] = graph.nodes.map((m) => ({
    id: m.key,
    type: 'module',
    position: positionByKey.get(m.key) ?? { x: 0, y: 0 },
    data: { module: m, isShared: m.isShared, barrel: m.barrel },
    draggable: false,
  }));

  const edges: Edge[] = graph.edges.map((e, i) => {
    const kind: ModuleEdgeData['kind'] =
      e.kind === 'breach'
        ? 'breach'
        : cycleEdges.has(`${e.from}\0${e.to}`)
          ? 'cycle'
          : 'legal';
    const isBreach = kind === 'breach';
    const isCycle = kind === 'cycle';
    const color = isBreach
      ? BREACH_EDGE_COLOR
      : isCycle
        ? CYCLE_EDGE_COLOR
        : LEGAL_EDGE_COLOR;
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
      animated: isBreach || isCycle,
      data: { kind },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: isBreach || isCycle ? 2 : 1.5,
        ...(isBreach || isCycle ? { strokeDasharray: '6 3' } : {}),
      },
    };
  });

  return { nodes, edges };
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
 * Assign each node a column = its layer's position in `layerOrder`, densified
 * over the layers actually present so a skipped layer leaves no empty column.
 * A node whose layer is absent from `layerOrder` is pushed to the far right
 * (after every known layer), keeping it visible without disturbing the bands.
 */
function layerColumnOf(
  graph: FeatureModuleGraph,
  layerOrder: readonly string[],
): (m: ModuleNode) => number {
  const orderIndex = new Map(layerOrder.map((name, i) => [name, i]));
  const rankOf = (layer: string) => orderIndex.get(layer) ?? layerOrder.length;

  const presentLayers = [...new Set(graph.nodes.map((n) => n.layer))].sort(
    (a, b) => rankOf(a) - rankOf(b),
  );
  const columnByLayer = new Map(presentLayers.map((layer, i) => [layer, i]));
  return (m) => columnByLayer.get(m.layer) ?? 0;
}

/**
 * Assign each node a column = longest chain of legal imports reaching it, so
 * sources pack into column 0 and the graph is as narrow as the dependencies
 * allow. Legal cycles are collapsed first (every node of a strongly-connected
 * component shares one column and the longest path runs over the acyclic
 * condensation), so a cycle settles in place instead of inflating the span.
 */
function depthColumnOf(graph: FeatureModuleGraph): (m: ModuleNode) => number {
  const present = new Set(graph.nodes.map((n) => n.key));
  const legal = graph.edges.filter(
    (e) => e.kind === 'legal' && present.has(e.from) && present.has(e.to),
  );
  const sccOf = stronglyConnectedComponents(graph.nodes, legal);

  const successors = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  for (const comp of sccOf.values()) {
    if (!successors.has(comp)) {
      successors.set(comp, new Set());
      indegree.set(comp, 0);
    }
  }
  for (const e of legal) {
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

  return (m) => compRank.get(sccOf.get(m.key)!) ?? 0;
}

/**
 * Keys (`from\0to`) of legal edges that close a cycle: both endpoints fall in
 * the same strongly-connected component (over legal edges) of size > 1. These
 * are the edges to flag — the layer-swimlane layout would otherwise draw them
 * as innocuous same-column lines, hiding the circular dependency.
 */
function cycleEdgeKeys(graph: FeatureModuleGraph): Set<string> {
  const present = new Set(graph.nodes.map((n) => n.key));
  const legal = graph.edges.filter(
    (e) => e.kind === 'legal' && present.has(e.from) && present.has(e.to),
  );
  const sccOf = stronglyConnectedComponents(graph.nodes, legal);

  const sccSize = new Map<number, number>();
  for (const comp of sccOf.values()) {
    sccSize.set(comp, (sccSize.get(comp) ?? 0) + 1);
  }

  const keys = new Set<string>();
  for (const e of legal) {
    const comp = sccOf.get(e.from)!;
    if (comp === sccOf.get(e.to) && (sccSize.get(comp) ?? 0) > 1) {
      keys.add(`${e.from}\0${e.to}`);
    }
  }
  return keys;
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
