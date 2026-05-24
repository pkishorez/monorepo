import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import { FEATURE_OVERVIEW } from '../files/file-tree-model';
import type { VisualizationConfig, VizSummary } from '../types';

export type HandleOffset = {
  stackName: string;
  offsetPct: number;
};

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
  nodeWidth?: number;
  handleOffsets?: HandleOffset[];
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
  summary: VizSummary | undefined,
  featureName: string | null | undefined,
): Set<string> {
  const layers = new Set<string>();
  if (!featureName || !config.features) return layers;

  if (summary?.featureGraphs) {
    const graphs =
      featureName === FEATURE_OVERVIEW
        ? summary.featureGraphs
        : summary.featureGraphs.filter((g) => g.feature === featureName);
    for (const graph of graphs) {
      for (const node of graph.nodes) {
        for (const layer of node.layers) layers.add(layer);
      }
    }
    if (layers.size > 0) return layers;
  }

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
  }

  const shared = new Set<string>();
  for (const [name, stacks] of layerToStacks) {
    if (stacks.length > 1) shared.add(name);
  }

  const stackColumns = config.stacks.map((s) => ({
    name: s.name,
    description: s.description,
    layers: s.layers.map((l) => l.name),
  }));

  const stackCenterX = new Map<string, number>();
  for (let i = 0; i < stackColumns.length; i++) {
    stackCenterX.set(stackColumns[i]!.name, i * (LAYER_NODE_WIDTH + COL_GAP));
  }

  const levels = computeLevels(config.stacks);
  const yOffset = HEADER_HEIGHT + HEADER_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  const nodeWidths = new Map<string, number>();
  const handleOffsetsMap = new Map<string, HandleOffset[]>();

  for (const stack of config.stacks) {
    const cx = stackCenterX.get(stack.name)!;
    for (const layer of stack.layers) {
      if (!shared.has(layer.name) && !positions.has(layer.name)) {
        positions.set(layer.name, {
          x: cx,
          y: yOffset + levels.get(layer.name)! * (NODE_HEIGHT + ROW_GAP),
        });
      }
    }
  }

  for (const layerName of shared) {
    const stacks = layerToStacks.get(layerName)!;
    const xPositions = stacks.map((s) => stackCenterX.get(s)!);
    const leftX = Math.min(...xPositions);
    const rightX = Math.max(...xPositions);
    const width = rightX + LAYER_NODE_WIDTH - leftX;

    positions.set(layerName, {
      x: leftX,
      y: yOffset + levels.get(layerName)! * (NODE_HEIGHT + ROW_GAP),
    });
    nodeWidths.set(layerName, width);

    handleOffsetsMap.set(
      layerName,
      stacks.map((s) => ({
        stackName: s,
        offsetPct:
          ((stackCenterX.get(s)! - leftX + LAYER_NODE_WIDTH / 2) / width) * 100,
      })),
    );
  }

  type PerStackEdge = {
    stackName: string;
    from: string;
    to: string;
    sourceHandle?: string;
    targetHandle?: string;
  };
  const hierarchyEdges: PerStackEdge[] = [];

  for (const stack of config.stacks) {
    for (let i = 0; i < stack.layers.length - 1; i++) {
      const fromName = stack.layers[i]!.name;
      const toName = stack.layers[i + 1]!.name;
      hierarchyEdges.push({
        stackName: stack.name,
        from: fromName,
        to: toName,
        sourceHandle: shared.has(fromName) ? `bottom-${stack.name}` : undefined,
        targetHandle: shared.has(toName) ? `top-${stack.name}` : undefined,
      });
    }
  }

  const dependedOnLayers = new Set(hierarchyEdges.map((e) => e.to));
  const featureLayers = getFeatureLayers(config, summary, selectedFeature);
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

  for (const [layerName, pos] of positions) {
    const meta = layerMeta.get(layerName);
    const isFeatureLayer = featureLayers.has(layerName);
    const isLayerSelected = layerName === selectedLayer;

    let isDimmed = false;
    if (hasFeatureSelection) {
      isDimmed = !isFeatureLayer;
    } else if (hasLayerSelection) {
      isDimmed = !isLayerSelected;
    }

    const width = nodeWidths.get(layerName) ?? LAYER_NODE_WIDTH;
    nodes.push({
      id: layerName,
      type: 'layer',
      position: pos,
      width,
      height: NODE_HEIGHT,
      data: {
        label: layerName,
        layerName,
        isEntry: !dependedOnLayers.has(layerName),
        isShared: shared.has(layerName),
        description: meta?.description,
        paths: meta?.paths,
        violationCount: violationCountByLayer.get(layerName) ?? 0,
        isSelected: isLayerSelected,
        isFeatureLayer,
        isDimmed,
        nodeWidth: nodeWidths.get(layerName),
        handleOffsets: handleOffsetsMap.get(layerName),
      } satisfies LayerNodeData,
    });
  }

  const dimmedOpacity = 0.15;

  const uniqueLayerEdges: Array<{ from: string; to: string }> = [];
  const seenPairs = new Set<string>();
  for (const e of hierarchyEdges) {
    const key = `${e.from}->${e.to}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      uniqueLayerEdges.push({ from: e.from, to: e.to });
    }
  }

  const activeEdgePairs = hasFeatureSelection
    ? computeActiveEdges(uniqueLayerEdges, featureLayers)
    : new Set<string>();

  const edges: Edge[] = hierarchyEdges.map((e) => {
    const edgeId = `${e.stackName}:${e.from}->${e.to}`;
    const pairKey = `${e.from}->${e.to}`;
    const isActive = hasFeatureSelection && activeEdgePairs.has(pairKey);
    return {
      id: edgeId,
      source: e.from,
      target: e.to,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
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
    const seenViolationEdges = new Set<string>();
    for (const v of summary.violations) {
      const matchingStacks = config.stacks.filter(
        (s) =>
          s.layers.some((l) => l.name === v.from) &&
          s.layers.some((l) => l.name === v.to),
      );
      for (const stack of matchingStacks) {
        const edgeId = `violation-${stack.name}:${v.from}->${v.to}`;
        if (seenViolationEdges.has(edgeId)) continue;
        seenViolationEdges.add(edgeId);

        const isViolationActive =
          hasFeatureSelection &&
          featureLayers.has(v.from) &&
          featureLayers.has(v.to);

        edges.push({
          id: edgeId,
          source: v.from,
          target: v.to,
          sourceHandle: shared.has(v.from) ? `bottom-${stack.name}` : undefined,
          targetHandle: shared.has(v.to) ? `top-${stack.name}` : undefined,
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
  }

  return { nodes, edges };
}

function computeActiveEdges(
  layerEdges: Array<{ from: string; to: string }>,
  featureLayers: Set<string>,
): Set<string> {
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const e of layerEdges) {
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
  for (const e of layerEdges) {
    if (canReachFeatureUp(e.from) && canReachFeatureDown(e.to)) {
      active.add(`${e.from}->${e.to}`);
    }
  }
  return active;
}

function computeLevels(
  stacks: VisualizationConfig['stacks'],
): Map<string, number> {
  const predecessors = new Map<string, Set<string>>();

  for (const stack of stacks) {
    for (const layer of stack.layers) {
      if (!predecessors.has(layer.name))
        predecessors.set(layer.name, new Set());
    }
    for (let i = 1; i < stack.layers.length; i++) {
      predecessors.get(stack.layers[i]!.name)!.add(stack.layers[i - 1]!.name);
    }
  }

  const levels = new Map<string, number>();

  function getLevel(name: string): number {
    if (levels.has(name)) return levels.get(name)!;
    const preds = predecessors.get(name);
    if (!preds || preds.size === 0) {
      levels.set(name, 0);
      return 0;
    }
    const level = Math.max(...[...preds].map(getLevel)) + 1;
    levels.set(name, level);
    return level;
  }

  for (const name of predecessors.keys()) {
    getLevel(name);
  }

  return levels;
}
