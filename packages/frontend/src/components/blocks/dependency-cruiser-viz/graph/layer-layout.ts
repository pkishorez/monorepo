import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import { FEATURE_OVERVIEW } from '../files/file-tree-model';
import type { VisualizationConfig, VizSummary } from '../types';

export type LayerNodeData = {
  label: string;
  layerName: string;
  isEntry: boolean;
  isShared: boolean;
  description?: string;
  paths?: string[];
  violationCount: number;
  isSelected: boolean;
  isFeatureLayer: boolean;
  isDimmed: boolean;
};

export type StackHeaderNodeData = {
  label: string;
  stackName: string;
  description?: string;
  isDimmed: boolean;
};

export const LAYER_NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const HEADER_HEIGHT = 30;
const HEADER_GAP = 16;
const ROW_GAP = 60;
const COL_GAP = 140;
const EDGE_COLOR = '#94a3b8';
const VIOLATION_EDGE_COLOR = '#ef4444';

function getFeatureLayers(
  config: VisualizationConfig,
  featureName: string | null | undefined,
): Set<string> {
  const layers = new Set<string>();
  if (!featureName || !config.features) return layers;

  const features =
    featureName === FEATURE_OVERVIEW
      ? config.features
      : config.features.filter((f) => f.name === featureName);

  if (features.length === 0) return layers;

  for (const feat of features) {
    for (const stack of config.stacks) {
      for (const layer of stack.layers) {
        for (const featurePath of feat.paths) {
          if (
            layer.paths.some(
              (lp) => featurePath.startsWith(lp + '/') || featurePath === lp,
            )
          ) {
            layers.add(layer.name);
          }
        }
      }
    }
  }
  return layers;
}

export function computeLayerLayout(
  config: VisualizationConfig,
  summary?: VizSummary,
  selectedLayer?: string | null,
  selectedFeature?: string | null,
): {
  nodes: Node[];
  edges: Edge[];
} {
  const violationCountByLayer = new Map<string, number>();
  if (summary) {
    for (const v of summary.violations) {
      violationCountByLayer.set(
        v.from,
        (violationCountByLayer.get(v.from) ?? 0) + 1,
      );
      violationCountByLayer.set(
        v.to,
        (violationCountByLayer.get(v.to) ?? 0) + 1,
      );
    }
  }

  const layerToStacks = new Map<string, string[]>();
  const hierarchyEdges: Array<{ from: string; to: string }> = [];
  const layerMeta = new Map<
    string,
    { description?: string; paths: string[] }
  >();

  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      const existing = layerToStacks.get(layer.name);
      if (existing) existing.push(stack.name);
      else layerToStacks.set(layer.name, [stack.name]);

      const meta = layerMeta.get(layer.name);
      if (meta) {
        for (const p of layer.paths) {
          if (!meta.paths.includes(p)) meta.paths.push(p);
        }
        if (layer.description && !meta.description) {
          meta.description = layer.description;
        }
      } else {
        layerMeta.set(layer.name, {
          description: layer.description,
          paths: [...layer.paths],
        });
      }
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
    description: s.description,
    layers: s.layers.filter((l) => !shared.has(l.name)).map((l) => l.name),
  }));

  const stackCenterX = new Map<string, number>();
  for (let i = 0; i < stackColumns.length; i++) {
    stackCenterX.set(stackColumns[i]!.name, i * (LAYER_NODE_WIDTH + COL_GAP));
  }

  const yOffset = HEADER_HEIGHT + HEADER_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  let maxExclusiveRow = 0;

  for (const col of stackColumns) {
    const cx = stackCenterX.get(col.name)!;
    for (let row = 0; row < col.layers.length; row++) {
      positions.set(col.layers[row]!, {
        x: cx,
        y: yOffset + row * (NODE_HEIGHT + ROW_GAP),
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
    const y = yOffset + (maxExclusiveRow + 1 + i) * (NODE_HEIGHT + ROW_GAP);
    positions.set(name, { x: cx, y });
  }

  const dependedOn = new Set(hierarchyEdges.map((e) => e.to));
  const featureLayers = getFeatureLayers(config, selectedFeature);
  const hasFeatureSelection = featureLayers.size > 0;
  const hasLayerSelection = !!selectedLayer;
  const hasSelection = hasLayerSelection || hasFeatureSelection;

  const nodes: Node[] = [];

  for (const col of stackColumns) {
    const cx = stackCenterX.get(col.name)!;
    const colHasSelected =
      hasLayerSelection && col.layers.includes(selectedLayer!);
    const colHasFeature =
      hasFeatureSelection && col.layers.some((l) => featureLayers.has(l));

    nodes.push({
      id: `header-${col.name}`,
      type: 'stackHeader',
      position: { x: cx, y: 0 },
      width: LAYER_NODE_WIDTH,
      height: HEADER_HEIGHT,
      data: {
        label: col.name,
        stackName: col.name,
        description: col.description,
        isDimmed: hasSelection && !colHasSelected && !colHasFeature,
      } satisfies StackHeaderNodeData,
    });
  }

  for (const [name, pos] of positions) {
    const meta = layerMeta.get(name);
    const isFeatureLayer = featureLayers.has(name);
    const isLayerSelected = name === selectedLayer;

    let isDimmed = false;
    if (hasFeatureSelection) {
      isDimmed = !isFeatureLayer;
    } else if (hasLayerSelection) {
      isDimmed = !isLayerSelected;
    }

    nodes.push({
      id: name,
      type: 'layer',
      position: pos,
      width: LAYER_NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        label: name,
        layerName: name,
        isEntry: !dependedOn.has(name),
        isShared: shared.has(name),
        description: meta?.description,
        paths: meta?.paths,
        violationCount: violationCountByLayer.get(name) ?? 0,
        isSelected: isLayerSelected,
        isFeatureLayer,
        isDimmed,
      } satisfies LayerNodeData,
    });
  }

  const dimmedOpacity = 0.15;

  const activeEdgeIds = hasFeatureSelection
    ? computeActiveEdges(hierarchyEdges, featureLayers)
    : new Set<string>();

  const edges: Edge[] = hierarchyEdges.map((e) => {
    const edgeId = `${e.from}->${e.to}`;
    const isActive = hasFeatureSelection && activeEdgeIds.has(edgeId);
    return {
      id: edgeId,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: EDGE_COLOR,
      },
      style: {
        stroke: EDGE_COLOR,
        strokeWidth: 1.5,
        opacity: hasSelection && !isActive ? dimmedOpacity : 1,
      },
    };
  });

  if (summary) {
    for (const v of summary.violations) {
      const edgeId = `violation-${v.from}->${v.to}`;
      if (edges.some((e) => e.id === edgeId)) continue;

      const isViolationActive =
        hasFeatureSelection &&
        featureLayers.has(v.from) &&
        featureLayers.has(v.to);

      edges.push({
        id: edgeId,
        source: v.from,
        target: v.to,
        type: 'smoothstep',
        animated: !hasSelection || isViolationActive,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: VIOLATION_EDGE_COLOR,
        },
        style: {
          stroke: VIOLATION_EDGE_COLOR,
          strokeWidth: 2,
          strokeDasharray: '6 3',
          opacity: hasSelection && !isViolationActive ? dimmedOpacity : 1,
        },
      });
    }
  }

  return { nodes, edges };
}

function computeActiveEdges(
  hierarchyEdges: Array<{ from: string; to: string }>,
  featureLayers: Set<string>,
): Set<string> {
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const e of hierarchyEdges) {
    let c = children.get(e.from);
    if (!c) {
      c = [];
      children.set(e.from, c);
    }
    c.push(e.to);
    let p = parents.get(e.to);
    if (!p) {
      p = [];
      parents.set(e.to, p);
    }
    p.push(e.from);
  }

  const upCache = new Map<string, boolean>();
  const upVisiting = new Set<string>();
  function canReachFeatureUp(node: string): boolean {
    if (upCache.has(node)) return upCache.get(node)!;
    if (upVisiting.has(node)) return false;
    if (featureLayers.has(node)) {
      upCache.set(node, true);
      return true;
    }
    upVisiting.add(node);
    const result = (parents.get(node) ?? []).some((p) => canReachFeatureUp(p));
    upVisiting.delete(node);
    upCache.set(node, result);
    return result;
  }

  const downCache = new Map<string, boolean>();
  const downVisiting = new Set<string>();
  function canReachFeatureDown(node: string): boolean {
    if (downCache.has(node)) return downCache.get(node)!;
    if (downVisiting.has(node)) return false;
    if (featureLayers.has(node)) {
      downCache.set(node, true);
      return true;
    }
    downVisiting.add(node);
    const result = (children.get(node) ?? []).some((c) =>
      canReachFeatureDown(c),
    );
    downVisiting.delete(node);
    downCache.set(node, result);
    return result;
  }

  const active = new Set<string>();
  for (const e of hierarchyEdges) {
    if (canReachFeatureUp(e.from) && canReachFeatureDown(e.to)) {
      active.add(`${e.from}->${e.to}`);
    }
  }
  return active;
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
