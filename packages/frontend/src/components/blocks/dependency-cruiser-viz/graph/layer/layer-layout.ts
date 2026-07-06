import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { VisualizationConfig, VizSummary } from '../../model';
import { buildLayerModel, scopedLayer } from '../../model/layer-model';
import {
  INCOMING_EDGE_COLOR,
  LEGAL_EDGE_COLOR,
  OUTGOING_EDGE_COLOR,
} from '../edge-colors';

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
  isHovered: boolean;
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
const SIBLING_GAP = 40;
const EDGE_COLOR = LEGAL_EDGE_COLOR;
const VIOLATION_EDGE_COLOR = '#ef4444';

export type SelectedViolation = { from: string; to: string };

export function computeLayerLayout(
  config: VisualizationConfig,
  summary?: VizSummary,
  selectedLayer?: string | null,
  selectedViolation?: SelectedViolation | null,
  hoveredLayer?: string | null,
): {
  nodes: Node[];
  edges: Edge[];
} {
  // Violation counts are keyed by bare layer name (summary carries bare names).
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

  // Derive slot/section/ordering from the shared layer model
  const layerModel = buildLayerModel(config, summary);

  // Layer key → stacks / meta.
  const layerToStacks = new Map<string, string[]>();
  const layerMeta = new Map<
    string,
    { name: string; description?: string; paths: string[] }
  >();

  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      const key = scopedLayer(undefined, layer.name);
      const existing = layerToStacks.get(key);
      if (existing) existing.push(stack.name);
      else layerToStacks.set(key, [stack.name]);

      const meta = layerMeta.get(key);
      if (meta) {
        for (const p of layer.paths) {
          if (!meta.paths.includes(p)) meta.paths.push(p);
        }
        if (layer.description && !meta.description) {
          meta.description = layer.description;
        }
      } else {
        layerMeta.set(key, {
          name: layer.name,
          description: layer.description,
          paths: [...layer.paths],
        });
      }
    }
  }

  const shared = new Set<string>();
  for (const [key, stacks] of layerToStacks) {
    if (stacks.length > 1) shared.add(key);
  }

  const stackColumns = config.stacks.map((s) => ({
    name: s.name,
    description: s.description,
    layers: s.layers.map((l) => scopedLayer(undefined, l.name)),
  }));

  // Per-layer level from layerModel slot index, keyed by layer identity.
  const levelByLayer = new Map<string, number>();
  for (const slot of layerModel.slots) {
    for (const section of slot.sections) {
      levelByLayer.set(section.key, slot.index);
    }
  }

  // Non-shared layers of one stack that land on the same level are siblings;
  // they spread horizontally around the stack's center column.
  const siblingGroups = new Map<string, Map<number, string[]>>();
  for (const stack of config.stacks) {
    const byLevel = new Map<number, string[]>();
    siblingGroups.set(stack.name, byLevel);
    for (const layer of stack.layers) {
      const key = scopedLayer(undefined, layer.name);
      if (shared.has(key)) continue;
      const level = levelByLayer.get(key)!;
      const group = byLevel.get(level);
      if (group) group.push(key);
      else byLevel.set(level, [key]);
    }
  }

  // Columns are spaced cumulatively so a stack wide with siblings does not
  // overlap its neighbor.
  const stackCenterX = new Map<string, number>();
  let nextX = 0;
  for (const stack of config.stacks) {
    const maxSiblings = Math.max(
      1,
      ...[...siblingGroups.get(stack.name)!.values()].map((g) => g.length),
    );
    const stackWidth =
      maxSiblings * LAYER_NODE_WIDTH + (maxSiblings - 1) * SIBLING_GAP;
    stackCenterX.set(stack.name, nextX + (stackWidth - LAYER_NODE_WIDTH) / 2);
    nextX += stackWidth + COL_GAP;
  }

  const yOffset = HEADER_HEIGHT + HEADER_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  const nodeWidths = new Map<string, number>();
  const handleOffsetsMap = new Map<string, HandleOffset[]>();

  for (const stack of config.stacks) {
    const cx = stackCenterX.get(stack.name)!;
    for (const [level, keys] of siblingGroups.get(stack.name)!) {
      keys.forEach((key, i) => {
        if (!positions.has(key)) {
          positions.set(key, {
            x:
              cx +
              (i - (keys.length - 1) / 2) * (LAYER_NODE_WIDTH + SIBLING_GAP),
            y: yOffset + level * (NODE_HEIGHT + ROW_GAP),
          });
        }
      });
    }
  }

  for (const key of shared) {
    const stacks = layerToStacks.get(key)!;
    const xPositions = stacks.map((s) => stackCenterX.get(s)!);
    const leftX = Math.min(...xPositions);
    const rightX = Math.max(...xPositions);
    const width = rightX + LAYER_NODE_WIDTH - leftX;

    positions.set(key, {
      x: leftX,
      y: yOffset + levelByLayer.get(key)! * (NODE_HEIGHT + ROW_GAP),
    });
    nodeWidths.set(key, width);

    handleOffsetsMap.set(
      key,
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
    for (const edge of stack.edges) {
      const fromKey = scopedLayer(undefined, edge.from);
      const toKey = scopedLayer(undefined, edge.to);
      hierarchyEdges.push({
        stackName: stack.name,
        from: fromKey,
        to: toKey,
        sourceHandle: shared.has(fromKey) ? `bottom-${stack.name}` : undefined,
        targetHandle: shared.has(toKey) ? `top-${stack.name}` : undefined,
      });
    }
  }

  const dependedOnLayers = new Set(hierarchyEdges.map((e) => e.to));

  // Selection/hover/violation are tracked by bare layer name (the click handler
  // and summary both speak bare names); dimming compares a node's bare name.
  const selectedLayers = new Set<string>();
  if (selectedLayer) selectedLayers.add(selectedLayer);
  if (selectedViolation) {
    selectedLayers.add(selectedViolation.from);
    selectedLayers.add(selectedViolation.to);
  }
  const activeLayers = new Set(selectedLayers);
  if (hoveredLayer) activeLayers.add(hoveredLayer);
  const hasSelection = activeLayers.size > 0;

  const nodes: Node[] = [];

  for (const col of stackColumns) {
    const cx = stackCenterX.get(col.name)!;
    const colHasSelected =
      hasSelection &&
      col.layers.some((k) => activeLayers.has(layerMeta.get(k)?.name ?? k));

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
        isDimmed: hasSelection && !colHasSelected,
      } satisfies StackHeaderNodeData,
    });
  }

  for (const [key, pos] of positions) {
    const meta = layerMeta.get(key);
    const bareName = meta?.name ?? key;
    const isLayerSelected = selectedLayers.has(bareName);
    const isDimmed = hasSelection && !activeLayers.has(bareName);

    const width = nodeWidths.get(key) ?? LAYER_NODE_WIDTH;
    nodes.push({
      id: key,
      type: 'layer',
      position: pos,
      width,
      height: NODE_HEIGHT,
      data: {
        label: bareName,
        layerName: bareName,
        isEntry: !dependedOnLayers.has(key),
        isShared: shared.has(key),
        description: meta?.description,
        paths: meta?.paths,
        violationCount: violationCountByLayer.get(bareName) ?? 0,
        isSelected: isLayerSelected,
        isHovered: bareName === hoveredLayer,
        isDimmed,
        nodeWidth: nodeWidths.get(key),
        handleOffsets: handleOffsetsMap.get(key),
      } satisfies LayerNodeData,
    });
  }

  const dimmedOpacity = 0.15;

  const edges: Edge[] = hierarchyEdges.map((e) => {
    const edgeId = `${e.stackName}:${e.from}->${e.to}`;
    const fromName = layerMeta.get(e.from)?.name ?? e.from;
    const toName = layerMeta.get(e.to)?.name ?? e.to;
    // An edge leaving an active layer is outgoing; one arriving is incoming.
    const isOutgoing = activeLayers.has(fromName);
    const isIncoming = activeLayers.has(toName);
    const color = isOutgoing
      ? OUTGOING_EDGE_COLOR
      : isIncoming
        ? INCOMING_EDGE_COLOR
        : EDGE_COLOR;
    const isHighlighted = isOutgoing || isIncoming;
    return {
      id: edgeId,
      source: e.from,
      target: e.to,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'default',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: isHighlighted ? 2 : 1.5,
        opacity: hasSelection && !isHighlighted ? dimmedOpacity : 1,
      },
    };
  });

  if (selectedViolation) {
    const from = resolveKey(selectedViolation.from, positions, layerMeta);
    const to = resolveKey(selectedViolation.to, positions, layerMeta);
    if (from && to) {
      edges.push({
        id: `violation:${selectedViolation.from}->${selectedViolation.to}`,
        source: from,
        target: to,
        sourceHandle: 'violation-source',
        targetHandle: 'violation-target',
        type: 'default',
        animated: true,
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
        },
      });
    }
  }

  return { nodes, edges };
}

/** Resolve a bare layer name to a position key. */
function resolveKey(
  bareName: string,
  positions: Map<string, { x: number; y: number }>,
  layerMeta: Map<string, { name: string }>,
): string | undefined {
  if (positions.has(bareName)) return bareName;
  for (const [key, meta] of layerMeta) {
    if (meta.name === bareName && positions.has(key)) return key;
  }
  return undefined;
}
