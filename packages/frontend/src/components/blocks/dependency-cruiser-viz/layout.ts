import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { VisualizationConfig } from './types';

export type LayerNodeData = {
  label: string;
  isEntry: boolean;
  isShared: boolean;
};

export const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const ROW_GAP = 60;
const COL_GAP = 140;
const EDGE_COLOR = '#94a3b8';

export function computeLayout(config: VisualizationConfig): {
  nodes: Node<LayerNodeData>[];
  edges: Edge[];
} {
  const layerToStacks = new Map<string, string[]>();
  const hierarchyEdges: Array<{ from: string; to: string }> = [];

  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      const existing = layerToStacks.get(layer.name);
      if (existing) existing.push(stack.name);
      else layerToStacks.set(layer.name, [stack.name]);
    }
    for (let i = 0; i < stack.layers.length - 1; i++) {
      const from = stack.layers[i]!.name;
      const to = stack.layers[i + 1]!.name;
      if (!hierarchyEdges.some((e) => e.from === from && e.to === to)) {
        hierarchyEdges.push({ from, to });
      }
    }
  }

  const shared = new Set<string>();
  for (const [name, stacks] of layerToStacks) {
    if (stacks.length > 1) shared.add(name);
  }

  const stackColumns = config.stacks.map((s) => ({
    name: s.name,
    layers: s.layers.filter((l) => !shared.has(l.name)).map((l) => l.name),
  }));

  const stackCenterX = new Map<string, number>();
  for (let i = 0; i < stackColumns.length; i++) {
    stackCenterX.set(stackColumns[i]!.name, i * (NODE_WIDTH + COL_GAP));
  }

  const positions = new Map<string, { x: number; y: number }>();
  let maxExclusiveRow = 0;

  for (const col of stackColumns) {
    const cx = stackCenterX.get(col.name)!;
    for (let row = 0; row < col.layers.length; row++) {
      positions.set(col.layers[row]!, {
        x: cx,
        y: row * (NODE_HEIGHT + ROW_GAP),
      });
      maxExclusiveRow = Math.max(maxExclusiveRow, row);
    }
  }

  const sharedOrdered = [...shared].sort((a, b) => {
    const rankA = maxRankAcrossStacks(a, config);
    const rankB = maxRankAcrossStacks(b, config);
    return rankA - rankB;
  });

  for (let i = 0; i < sharedOrdered.length; i++) {
    const name = sharedOrdered[i]!;
    const stacks = layerToStacks.get(name)!;
    const cx =
      stacks.reduce((sum, s) => sum + (stackCenterX.get(s) ?? 0), 0) /
      stacks.length;
    const y = (maxExclusiveRow + 1 + i) * (NODE_HEIGHT + ROW_GAP);
    positions.set(name, { x: cx, y });
  }

  const dependedOn = new Set(hierarchyEdges.map((e) => e.to));

  const nodes: Node<LayerNodeData>[] = [...positions.entries()].map(
    ([name, pos]) => ({
      id: name,
      type: 'layer' as const,
      position: pos,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        label: name,
        isEntry: !dependedOn.has(name),
        isShared: shared.has(name),
      },
    }),
  );

  const edges: Edge[] = hierarchyEdges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: EDGE_COLOR,
    },
    style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

function maxRankAcrossStacks(
  layerName: string,
  config: VisualizationConfig,
): number {
  let max = 0;
  for (const stack of config.stacks) {
    const idx = stack.layers.findIndex((l) => l.name === layerName);
    if (idx > max) max = idx;
  }
  return max;
}
