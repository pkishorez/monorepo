import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { VisualizationConfig, VizSummary } from '../../model';
import {
  buildLayerModel,
  orderStacksByGroup,
  scopedLayer,
} from '../../model/layer-model';

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

export type GroupRegionNodeData = {
  label: string;
  width: number;
  height: number;
};

export const LAYER_NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const HEADER_HEIGHT = 30;
const HEADER_GAP = 16;
const ROW_GAP = 60;
const COL_GAP = 140;
const GROUP_PAD = 24;
const GROUP_LABEL_HEIGHT = 22;
const EDGE_COLOR = '#94a3b8';
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

  const orderedStacks = orderStacksByGroup(config.stacks);

  // Scoped-key → stacks / meta. Keying by scoped identity keeps same-named
  // layers in different groups distinct (one node id each).
  const layerToStacks = new Map<string, string[]>();
  const layerMeta = new Map<
    string,
    { name: string; group: string; description?: string; paths: string[] }
  >();

  for (const stack of orderedStacks) {
    const group = stack.group ?? '';
    for (const layer of stack.layers) {
      const key = scopedLayer(group, layer.name);
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
          group,
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

  const stackColumns = orderedStacks.map((s) => ({
    name: s.name,
    group: s.group ?? '',
    description: s.description,
    layers: s.layers.map((l) => scopedLayer(s.group ?? '', l.name)),
  }));

  const stackCenterX = new Map<string, number>();
  for (let i = 0; i < stackColumns.length; i++) {
    stackCenterX.set(stackColumns[i]!.name, i * (LAYER_NODE_WIDTH + COL_GAP));
  }

  // Per-layer level from layerModel slot index, keyed by scoped identity.
  const levelByLayer = new Map<string, number>();
  for (const slot of layerModel.slots) {
    for (const section of slot.sections) {
      levelByLayer.set(section.key, slot.index);
    }
  }

  const yOffset = HEADER_HEIGHT + HEADER_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  const nodeWidths = new Map<string, number>();
  const handleOffsetsMap = new Map<string, HandleOffset[]>();

  for (const stack of orderedStacks) {
    const cx = stackCenterX.get(stack.name)!;
    const group = stack.group ?? '';
    for (const layer of stack.layers) {
      const key = scopedLayer(group, layer.name);
      if (!shared.has(key) && !positions.has(key)) {
        positions.set(key, {
          x: cx,
          y: yOffset + levelByLayer.get(key)! * (NODE_HEIGHT + ROW_GAP),
        });
      }
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

  for (const stack of orderedStacks) {
    const group = stack.group ?? '';
    for (let i = 0; i < stack.layers.length - 1; i++) {
      const fromKey = scopedLayer(group, stack.layers[i]!.name);
      const toKey = scopedLayer(group, stack.layers[i + 1]!.name);
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

  // Group regions first so they render behind headers/layers.
  for (const band of groupRegions(orderedStacks, stackCenterX, positions)) {
    nodes.push({
      id: `group-${band.group}`,
      type: 'groupRegion',
      position: { x: band.x, y: band.y },
      width: band.width,
      height: band.height,
      selectable: false,
      draggable: false,
      data: {
        label: band.group,
        width: band.width,
        height: band.height,
      } satisfies GroupRegionNodeData,
    });
  }

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
        opacity: hasSelection ? dimmedOpacity : 1,
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
        type: 'smoothstep',
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

/** Resolve a bare layer name to a scoped position key (identity for the default
 *  group; otherwise the first matching scoped key). */
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

type GroupRegion = {
  group: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One enclosing rect per non-default group, spanning its stack columns and all
 *  their layer rows, with a label slot above the stack headers. */
function groupRegions(
  orderedStacks: ReturnType<typeof orderStacksByGroup>,
  stackCenterX: Map<string, number>,
  positions: Map<string, { x: number; y: number }>,
): GroupRegion[] {
  const byGroup = new Map<string, ReturnType<typeof orderStacksByGroup>>();
  for (const s of orderedStacks) {
    const g = s.group ?? '';
    if (g === '') continue;
    const list = byGroup.get(g);
    if (list) list.push(s);
    else byGroup.set(g, [s]);
  }

  const regions: GroupRegion[] = [];
  for (const [group, stacks] of byGroup) {
    const xs = stacks.map((s) => stackCenterX.get(s.name)!);
    const left = Math.min(...xs) - GROUP_PAD;
    const right = Math.max(...xs) + LAYER_NODE_WIDTH + GROUP_PAD;

    let bottom = HEADER_HEIGHT;
    for (const s of stacks) {
      const g = s.group ?? '';
      for (const layer of s.layers) {
        const pos = positions.get(scopedLayer(g, layer.name));
        if (pos) bottom = Math.max(bottom, pos.y + NODE_HEIGHT);
      }
    }

    const top = -(GROUP_LABEL_HEIGHT + GROUP_PAD);
    regions.push({
      group,
      x: left,
      y: top,
      width: right - left,
      height: bottom + GROUP_PAD - top,
    });
  }
  return regions;
}
