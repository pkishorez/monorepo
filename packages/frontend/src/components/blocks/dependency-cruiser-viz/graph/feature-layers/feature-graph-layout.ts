import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { FeatureModuleGraph } from '../../model';
import type { ModuleNode } from '../../model';

export type ModuleGraphNodeData = {
  module: ModuleNode;
  /** Owned by the feature (strong fill) vs consumed (dashed/borrowed). */
  isOwned: boolean;
};

export type ModuleEdgeData = {
  kind: 'legal' | 'breach';
};

export const MODULE_NODE_WIDTH = 180;
export const MODULE_NODE_HEIGHT = 52;
export const LEGAL_EDGE_COLOR = '#94a3b8';
export const BREACH_EDGE_COLOR = '#ef4444';
/** Horizontal gap between layer columns. */
export const COL_GAP = 140;
/** Vertical gap between modules stacked within a column. */
export const ROW_GAP = 60;

const COL_PITCH = MODULE_NODE_WIDTH + COL_GAP;
const ROW_PITCH = MODULE_NODE_HEIGHT + ROW_GAP;

/**
 * Lay a feature's module graph left → right in columns by **import depth**: a
 * node's column is the longest chain of legal imports that reaches it, so every
 * source (nothing imports it) sits in column 0 and every legal edge flows
 * strictly left → right. Breach edges (illegal backward imports) keep their
 * endpoints and so read right → left, which is exactly what marks the
 * violation. Within a column, modules are ordered vertically by a barycenter
 * sweep so they line up under their neighbours and crossings stay low.
 *
 * Layer levels are deliberately NOT used for columns: a deep-layer module that
 * is itself a source would otherwise be pinned far right despite being a root,
 * and same-layer imports would collapse into one column and render backwards.
 *
 * Owned modules carry the strong highlight, consumed ones the dashed/borrowed
 * style; breach edges read red/dashed, legal edges slate. `ownedKeys` decides
 * each node's tier.
 */
export function computeFeatureGraphLayout(
  graph: FeatureModuleGraph,
  ownedKeys: ReadonlySet<string>,
): { nodes: Node<ModuleGraphNodeData>[]; edges: Edge[] } {
  const rank = longestPathColumns(graph);
  const colOf = (m: ModuleNode): number => rank.get(m.key) ?? 0;

  // Group nodes into columns, keeping graph order as the initial within-column
  // order. `columns` is dense and 0-indexed by column number.
  const maxCol = graph.nodes.reduce((mx, m) => Math.max(mx, colOf(m)), 0);
  const columns: ModuleNode[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const m of graph.nodes) columns[colOf(m)]!.push(m);

  orderColumnsByBarycenter(columns, graph.edges);

  // Center each column around a shared midline so uneven columns stay balanced.
  const tallest = columns.reduce((mx, col) => Math.max(mx, col.length), 0);
  const midline = ((tallest - 1) * ROW_PITCH) / 2;

  const positionByKey = new Map<string, { x: number; y: number }>();
  columns.forEach((col, colIndex) => {
    const top = midline - ((col.length - 1) * ROW_PITCH) / 2;
    col.forEach((m, rowIndex) => {
      positionByKey.set(m.key, {
        x: colIndex * COL_PITCH,
        y: top + rowIndex * ROW_PITCH,
      });
    });
  });

  const nodes: Node<ModuleGraphNodeData>[] = graph.nodes.map((m) => ({
    id: m.key,
    type: 'module',
    position: positionByKey.get(m.key) ?? { x: 0, y: 0 },
    data: { module: m, isOwned: ownedKeys.has(m.key) },
    draggable: false,
  }));

  const edges: Edge[] = graph.edges.map((e, i) => {
    const isBreach = e.kind === 'breach';
    const color = isBreach ? BREACH_EDGE_COLOR : LEGAL_EDGE_COLOR;
    return {
      id: `${e.from}->${e.to}:${e.kind}:${i}`,
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
      data: { kind: e.kind },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: isBreach ? 2 : 1.5,
        ...(isBreach ? { strokeDasharray: '6 3' } : {}),
      },
    };
  });

  return { nodes, edges };
}

/**
 * Assign each node a column = longest chain of LEGAL imports reaching it, so
 * sources land in column 0 and every legal edge moves strictly right. Breach
 * edges are excluded from the ranking — an illegal backward import must not
 * push its target forward, and is meant to read right → left in the result.
 *
 * Relaxation is capped at one pass per node, which keeps any legal-edge cycle
 * (rare, but transitive reduction preserves true cycles) from looping forever;
 * a cycle just settles at the cap rather than diverging.
 */
function longestPathColumns(graph: FeatureModuleGraph): Map<string, number> {
  const present = new Set(graph.nodes.map((n) => n.key));
  const legal = graph.edges.filter(
    (e) => e.kind === 'legal' && present.has(e.from) && present.has(e.to),
  );

  const rank = new Map<string, number>();
  for (const n of graph.nodes) rank.set(n.key, 0);

  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let changed = false;
    for (const e of legal) {
      const next = rank.get(e.from)! + 1;
      if (next > rank.get(e.to)!) {
        rank.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return rank;
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
