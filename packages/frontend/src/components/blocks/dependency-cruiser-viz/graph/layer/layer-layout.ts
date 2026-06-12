import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

import type { VisualizationConfig, VizSummary } from '../../model';
import { buildLayerModel } from '../../model/layer-model';

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

export function computeLayerLayout(
  config: VisualizationConfig,
  summary?: VizSummary,
  selectedLayer?: string | null,
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

  // Derive slot/section/ordering from the shared layer model
  const layerModel = buildLayerModel(config, summary);

  // Build layer-to-stacks map for shared layer detection and handle offsets
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

  // Derive per-layer level from layerModel slot index (replaces computeLevels)
  const levelByLayer = new Map<string, number>();
  for (const slot of layerModel.slots) {
    for (const section of slot.sections) {
      levelByLayer.set(section.layer, slot.index);
    }
  }

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
          y: yOffset + levelByLayer.get(layer.name)! * (NODE_HEIGHT + ROW_GAP),
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
      y: yOffset + levelByLayer.get(layerName)! * (NODE_HEIGHT + ROW_GAP),
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
  const hasLayerSelection = !!selectedLayer;
  const hasSelection = hasLayerSelection;

  const nodes: Node[] = [];

  for (const col of stackColumns) {
    const cx = stackCenterX.get(col.name)!;
    const colHasSelected =
      hasLayerSelection && col.layers.includes(selectedLayer!);

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

  for (const [layerName, pos] of positions) {
    const meta = layerMeta.get(layerName);
    const isLayerSelected = layerName === selectedLayer;
    const isDimmed = hasLayerSelection && !isLayerSelected;

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
        isDimmed,
        nodeWidth: nodeWidths.get(layerName),
        handleOffsets: handleOffsetsMap.get(layerName),
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

        edges.push({
          id: edgeId,
          source: v.from,
          target: v.to,
          sourceHandle: shared.has(v.from) ? `bottom-${stack.name}` : undefined,
          targetHandle: shared.has(v.to) ? `top-${stack.name}` : undefined,
          type: 'smoothstep',
          animated: !hasSelection,
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
            opacity: hasSelection ? dimmedOpacity : 1,
          },
        });
      }
    }
  }

  return { nodes, edges };
}
