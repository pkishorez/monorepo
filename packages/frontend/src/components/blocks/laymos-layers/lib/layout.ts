import { MarkerType, type Edge, type Node } from '@xyflow/react';

import { layerColors } from './colors';
import type { LaymosLayersModel, ActiveModel } from './model';
import { edgeKey } from './model';
import type {
  GraphHeaderNodeData,
  LaneNodeData,
  LayerNodeData,
} from '../components/flow-nodes';
import type { LaymosNode } from '../types';

const LAYER_WIDTH = 180;
const LAYER_HEIGHT = 64;
const HEADER_WIDTH = 180;
const HEADER_HEIGHT = 56;
const LANE_PADDING = 32;
const LANE_GAP = 72;
const SIBLING_GAP = 24;
const RANK_ROW_GAP = 20;
const RANK_GAP = 88;
const LAYER_OFFSET_Y = 92;

interface LaneLayout {
  readonly name: string;
  readonly x: number;
  readonly width: number;
  readonly center: number;
}

function computeLanes(model: LaymosLayersModel): LaneLayout[] {
  let nextX = 0;
  return model.report.architecture.graphs.map((graph) => {
    const counts = new Map<number, number>();
    for (const layer of graph.layers) {
      if ((model.layers.get(layer)?.graphs.length ?? 0) > 1) continue;
      const rank = model.ranks.get(layer) ?? 0;
      counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    const maxSiblings = Math.max(1, ...counts.values());
    const width =
      maxSiblings * LAYER_WIDTH +
      (maxSiblings - 1) * SIBLING_GAP +
      LANE_PADDING * 2;
    const lane = {
      name: graph.name,
      x: nextX,
      width,
      center: nextX + width / 2,
    };
    nextX += width + LANE_GAP;
    return lane;
  });
}

function violationCountForGraph(
  model: LaymosLayersModel,
  graphName: string,
): number {
  const layers = new Set(model.graphByName.get(graphName)?.layers ?? []);
  return model.report.violations.filter(
    (violation) =>
      violation.kind === 'layer' &&
      (layers.has(violation.from.layer) || layers.has(violation.to.layer)),
  ).length;
}

function configuredEdgeActive(
  active: ActiveModel,
  graph: string,
  from: string,
  to: string,
): boolean {
  if (!active.node) return true;
  if (active.node.kind === 'graph') return active.activeGraphs.has(graph);
  return active.node.name === from || active.node.name === to;
}

interface LayerPosition {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

function connectionHandles(
  model: LaymosLayersModel,
  positions: ReadonlyMap<string, LayerPosition>,
  from: string,
  to: string,
  graph?: string,
): { sourceHandle: string; targetHandle: string } {
  const source = positions.get(from)!;
  const target = positions.get(to)!;
  const deltaX = target.x + target.width / 2 - (source.x + source.width / 2);
  const deltaY = target.y - source.y;
  const sharedTarget =
    graph && (model.layers.get(to)?.graphs.length ?? 0) > 1
      ? `target-${graph}`
      : undefined;

  if (Math.abs(deltaY) < LAYER_HEIGHT) {
    return deltaX >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }

  if (deltaY > 0) {
    if (deltaX > LAYER_WIDTH / 3) {
      return {
        sourceHandle: 'source-bottom-right',
        targetHandle: sharedTarget ?? 'target-top-left',
      };
    }
    if (deltaX < -LAYER_WIDTH / 3) {
      return {
        sourceHandle: 'source-bottom-left',
        targetHandle: sharedTarget ?? 'target-top-right',
      };
    }
    return {
      sourceHandle: 'source-bottom',
      targetHandle: sharedTarget ?? 'target-top',
    };
  }

  if (deltaX > LAYER_WIDTH / 3) {
    return { sourceHandle: 'source-right', targetHandle: 'target-left' };
  }
  if (deltaX < -LAYER_WIDTH / 3) {
    return { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }
  return { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}

export interface LaymosFlowLayout {
  readonly nodes: Node[];
  readonly edges: Edge[];
}

/** Converts the query model into stable React Flow geometry and visual state. */
export function computeLaymosFlowLayout(
  model: LaymosLayersModel,
  active: ActiveModel,
  hoveredWithinSelection: LaymosNode | null = null,
  hoveredGraph: string | null = null,
  showObservedConnections = true,
): LaymosFlowLayout {
  const hoveredLayer =
    hoveredWithinSelection?.kind === 'layer'
      ? hoveredWithinSelection.name
      : undefined;
  const edgeFocusLayer =
    hoveredLayer !== undefined &&
    (model.displayConfiguredEdges.some(
      (edge) =>
        configuredEdgeActive(active, edge.graph, edge.from, edge.to) &&
        (edge.from === hoveredLayer || edge.to === hoveredLayer),
    ) ||
      (showObservedConnections &&
        model.observedEdges.some(
          (edge) =>
            active.visibleObservedEdges.has(edgeKey(edge.from, edge.to)) &&
            (edge.from === hoveredLayer || edge.to === hoveredLayer),
        )))
      ? hoveredLayer
      : undefined;
  const edgeHighlightedLayers = new Set(
    showObservedConnections
      ? active.relatedLayers
      : active.node?.kind === 'graph'
        ? (model.graphByName.get(active.node.name)?.layers ?? [])
        : active.node
          ? [
              active.node.name,
              ...model.displayConfiguredEdges.flatMap((edge) =>
                edge.from === active.node?.name || edge.to === active.node?.name
                  ? [edge.from, edge.to]
                  : [],
              ),
            ]
          : [],
  );
  if (edgeFocusLayer !== undefined) {
    edgeHighlightedLayers.clear();
    edgeHighlightedLayers.add(edgeFocusLayer);
    for (const edge of model.displayConfiguredEdges) {
      if (
        configuredEdgeActive(active, edge.graph, edge.from, edge.to) &&
        (edge.from === edgeFocusLayer || edge.to === edgeFocusLayer)
      ) {
        edgeHighlightedLayers.add(edge.from);
        edgeHighlightedLayers.add(edge.to);
      }
    }
    if (showObservedConnections) {
      for (const edge of model.observedEdges) {
        if (
          active.visibleObservedEdges.has(edgeKey(edge.from, edge.to)) &&
          (edge.from === edgeFocusLayer || edge.to === edgeFocusLayer)
        ) {
          edgeHighlightedLayers.add(edge.from);
          edgeHighlightedLayers.add(edge.to);
        }
      }
    }
  }
  const lanes = computeLanes(model);
  const laneByName = new Map(lanes.map((lane) => [lane.name, lane]));
  const maxRank = Math.max(0, ...model.ranks.values());
  let laneHeight =
    LAYER_OFFSET_Y + (maxRank + 1) * LAYER_HEIGHT + maxRank * RANK_GAP + 36;
  const nodes: Node[] = [];

  for (const lane of lanes) {
    const dimmed = Boolean(active.node && !active.activeGraphs.has(lane.name));
    nodes.push({
      id: `lane:${lane.name}`,
      type: 'lane',
      position: { x: lane.x, y: 0 },
      width: lane.width,
      height: laneHeight,
      selectable: false,
      focusable: false,
      draggable: false,
      zIndex: -1,
      style: { pointerEvents: 'none' },
      data: {
        label: lane.name,
        highlighted: hoveredGraph === lane.name,
        dimmed,
      } satisfies LaneNodeData,
    });
    const graph = model.graphByName.get(lane.name)!;
    const graphLayers = graph.layers.flatMap((layer) => {
      const summary = model.layers.get(layer);
      return summary ? [summary] : [];
    });
    nodes.push({
      id: `graph:${lane.name}`,
      type: 'graphHeader',
      position: {
        x: lane.center - HEADER_WIDTH / 2,
        y: 18,
      },
      width: HEADER_WIDTH,
      height: HEADER_HEIGHT,
      zIndex: 4,
      selectable: false,
      focusable: false,
      draggable: false,
      data: {
        name: lane.name,
        fileCount: graphLayers.reduce(
          (total, layer) => total + layer.fileCount,
          0,
        ),
        moduleCoveredFiles: graphLayers.reduce(
          (total, layer) => total + layer.moduleCoveredFiles,
          0,
        ),
        moduleTotalFiles: graphLayers.reduce(
          (total, layer) => total + layer.moduleTotalFiles,
          0,
        ),
        violationCount: violationCountForGraph(model, lane.name),
        dimmed,
        ...(graph.description !== undefined
          ? { description: graph.description }
          : {}),
      } satisfies GraphHeaderNodeData,
    });
  }

  const positions = new Map<string, LayerPosition>();
  for (const graph of model.report.architecture.graphs) {
    const lane = laneByName.get(graph.name)!;
    const byRank = new Map<number, string[]>();
    for (const layer of graph.layers) {
      if ((model.layers.get(layer)?.graphs.length ?? 0) > 1) continue;
      const rank = model.ranks.get(layer) ?? 0;
      const siblings = byRank.get(rank) ?? [];
      siblings.push(layer);
      byRank.set(rank, siblings);
    }
    for (const [rank, siblings] of byRank) {
      siblings.forEach((layer, index) => {
        positions.set(layer, {
          x:
            lane.center -
            LAYER_WIDTH / 2 +
            (index - (siblings.length - 1) / 2) * (LAYER_WIDTH + SIBLING_GAP),
          y: LAYER_OFFSET_Y + rank * (LAYER_HEIGHT + RANK_GAP),
          width: LAYER_WIDTH,
        });
      });
    }
  }

  for (const layer of model.layers.values()) {
    if (layer.graphs.length < 2) continue;
    const memberLanes = layer.graphs.map((graph) => laneByName.get(graph)!);
    const left = Math.min(...memberLanes.map((lane) => lane.center));
    const right = Math.max(...memberLanes.map((lane) => lane.center));
    positions.set(layer.name, {
      x: left - LAYER_WIDTH / 2,
      y:
        LAYER_OFFSET_Y +
        (model.ranks.get(layer.name) ?? 0) * (LAYER_HEIGHT + RANK_GAP),
      width: right - left + LAYER_WIDTH,
    });
  }

  let nextRankY = LAYER_OFFSET_Y;
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const layersAtRank = [...model.layers.values()]
      .filter((layer) => (model.ranks.get(layer.name) ?? 0) === rank)
      .map((layer) => ({ layer, position: positions.get(layer.name) }))
      .filter(
        (
          item,
        ): item is {
          layer: (typeof item)['layer'];
          position: LayerPosition;
        } => item.position !== undefined,
      )
      .sort(
        (left, right) =>
          left.position.x - right.position.x ||
          right.position.width - left.position.width,
      );
    const rowEnds: number[] = [];
    for (const { layer, position } of layersAtRank) {
      let row = rowEnds.findIndex((end) => position.x >= end + SIBLING_GAP);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = position.x + position.width;
      positions.set(layer.name, {
        ...position,
        y: nextRankY + row * (LAYER_HEIGHT + RANK_ROW_GAP),
      });
    }
    const rowCount = Math.max(1, rowEnds.length);
    nextRankY +=
      rowCount * LAYER_HEIGHT + (rowCount - 1) * RANK_ROW_GAP + RANK_GAP;
  }
  laneHeight = nextRankY - RANK_GAP + 36;
  nodes.forEach((node, index) => {
    if (node.type === 'lane') nodes[index] = { ...node, height: laneHeight };
  });

  for (const layer of model.layers.values()) {
    const position = positions.get(layer.name);
    if (!position) continue;
    const memberLanes = layer.graphs.map((graph) => laneByName.get(graph)!);
    const violationCount =
      layer.incomingViolationCount + layer.outgoingViolationCount;
    const targetHandles =
      layer.graphs.length < 2
        ? []
        : memberLanes.map((lane) => ({
            id: `target-${lane.name}`,
            offset: ((lane.center - position.x) / position.width) * 100,
          }));
    nodes.push({
      id: `layer:${layer.name}`,
      type: 'layer',
      position: { x: position.x, y: position.y },
      width: position.width,
      height: LAYER_HEIGHT,
      zIndex: 4,
      selectable: false,
      focusable: false,
      draggable: false,
      data: {
        name: layer.name,
        isRoot: layer.isRoot,
        isSink: layer.isSink,
        graphCount: layer.graphs.length,
        fileCount: layer.fileCount,
        moduleCoveredFiles: layer.moduleCoveredFiles,
        moduleTotalFiles: layer.moduleTotalFiles,
        violationCount,
        related: Boolean(active.node && edgeHighlightedLayers.has(layer.name)),
        dimmed: Boolean(active.node && !edgeHighlightedLayers.has(layer.name)),
        targetHandles,
      } satisfies LayerNodeData,
    });
  }

  const edges: Edge[] = model.report.architecture.graphs.flatMap((graph) => {
    const targets = new Set(graph.edges.map((edge) => edge.to));
    return graph.layers
      .filter((layer) => !targets.has(layer))
      .map(
        (layer): Edge => ({
          id: `membership:${graph.name}->${layer}`,
          source: `graph:${graph.name}`,
          target: `layer:${layer}`,
          sourceHandle: 'source-bottom',
          targetHandle:
            (model.layers.get(layer)?.graphs.length ?? 0) > 1
              ? `target-${graph.name}`
              : 'target-top',
          type: 'smoothstep',
          markerEnd: undefined,
          interactionWidth: 0,
          className: 'pointer-events-none',
          style: {
            stroke: layerColors.configured,
            strokeWidth: 1,
            strokeDasharray: '3 5',
            opacity:
              active.node && !active.activeGraphs.has(graph.name) ? 0.06 : 0.3,
            pointerEvents: 'none',
          },
          zIndex: 0,
        }),
      );
  });

  const configuredByPair = new Map<
    string,
    { from: string; to: string; graphs: string[] }
  >();
  for (const edge of model.displayConfiguredEdges) {
    const key = edgeKey(edge.from, edge.to);
    const existing = configuredByPair.get(key);
    if (existing) {
      existing.graphs.push(edge.graph);
    } else {
      configuredByPair.set(key, {
        from: edge.from,
        to: edge.to,
        graphs: [edge.graph],
      });
    }
  }

  const mergedObservedKeys = new Set<string>();
  edges.push(
    ...[...configuredByPair.values()].map((edge): Edge => {
      const key = edgeKey(edge.from, edge.to);
      const observed =
        showObservedConnections && active.visibleObservedEdges.has(key)
          ? model.observedEdgeByKey.get(key)
          : undefined;
      if (observed) mergedObservedKeys.add(key);
      const highlighted = edge.graphs.some((graph) =>
        configuredEdgeActive(active, graph, edge.from, edge.to),
      );
      const routingGraph =
        edge.graphs.length === 1 ? edge.graphs[0] : undefined;
      const handles = connectionHandles(
        model,
        positions,
        edge.from,
        edge.to,
        routingGraph,
      );
      const layerActive = active.node?.kind === 'layer';
      const hoverMatches =
        edgeFocusLayer === undefined ||
        edge.from === edgeFocusLayer ||
        edge.to === edgeFocusLayer;
      const hoverFiltering = edgeFocusLayer !== undefined && highlighted;
      const visualEmphasis = hoverFiltering && hoverMatches;
      const hoverDimmed = hoverFiltering && !hoverMatches;
      const color = observed?.violating
        ? layerColors.violation
        : observed && layerActive && edge.to === active.node.name
          ? layerColors.observedIncoming
          : observed && layerActive && edge.from === active.node.name
            ? layerColors.observedOutgoing
            : observed
              ? layerColors.observed
              : !showObservedConnections && active.node && highlighted
                ? layerColors.configuredActive
                : layerColors.configured;
      const importCount = observed?.fileEdges.length;
      return {
        id: `configured:${edge.graphs.join('+')}:${edge.from}->${edge.to}`,
        source: `layer:${edge.from}`,
        target: `layer:${edge.to}`,
        ...handles,
        type: 'smoothstep',
        label:
          layerActive && importCount !== undefined
            ? `${importCount}`
            : undefined,
        interactionWidth: 0,
        className: 'pointer-events-none',
        labelStyle: {
          fill: 'white',
          fontSize: 9,
          fontWeight: 700,
          opacity: hoverDimmed ? 0.25 : 1,
          pointerEvents: 'none',
        },
        labelBgStyle: {
          fill: color,
          fillOpacity: hoverDimmed ? 0.2 : 0.82,
          pointerEvents: 'none',
        },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 8,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 11,
          height: 11,
          color,
        },
        style: {
          stroke: color,
          strokeWidth: visualEmphasis
            ? 2.75
            : observed
              ? 2
              : !showObservedConnections && highlighted && active.node
                ? 2.25
                : highlighted && active.node
                  ? 1.5
                  : 1.15,
          strokeDasharray: observed?.violating ? '6 5' : undefined,
          opacity: hoverDimmed
            ? 0.12
            : observed
              ? 0.9
              : !showObservedConnections && highlighted && active.node
                ? 0.95
                : highlighted
                  ? 0.65
                  : 0.08,
          pointerEvents: 'none',
        },
        zIndex: 1,
      };
    }),
  );

  if (showObservedConnections)
    for (const edge of model.observedEdges) {
      const key = edgeKey(edge.from, edge.to);
      if (
        !active.visibleObservedEdges.has(key) ||
        mergedObservedKeys.has(key)
      ) {
        continue;
      }
      const layerActive = active.node?.kind === 'layer';
      const hoverMatches =
        edgeFocusLayer === undefined ||
        edge.from === edgeFocusLayer ||
        edge.to === edgeFocusLayer;
      const hoverDimmed = edgeFocusLayer !== undefined && !hoverMatches;
      const color = edge.violating
        ? layerColors.violation
        : layerActive && edge.to === active.node?.name
          ? layerColors.observedIncoming
          : layerActive && edge.from === active.node?.name
            ? layerColors.observedOutgoing
            : layerColors.observed;
      const sourceGraph = model.layers
        .get(edge.from)
        ?.graphs.find((graph) =>
          model.layers.get(edge.to)?.graphs.includes(graph),
        );
      const handles = connectionHandles(
        model,
        positions,
        edge.from,
        edge.to,
        sourceGraph,
      );
      const importCount = edge.fileEdges.length;
      edges.push({
        id: `observed:${edge.from}->${edge.to}`,
        source: `layer:${edge.from}`,
        target: `layer:${edge.to}`,
        ...handles,
        type: 'smoothstep',
        label: layerActive ? `${importCount}` : undefined,
        interactionWidth: 0,
        className: 'pointer-events-none',
        labelStyle: {
          fill: 'white',
          fontSize: 9,
          fontWeight: 700,
          opacity: hoverDimmed ? 0.25 : 1,
          pointerEvents: 'none',
        },
        labelBgStyle: {
          fill: color,
          fillOpacity: hoverDimmed ? 0.2 : 0.82,
          pointerEvents: 'none',
        },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 8,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color,
        },
        style: {
          stroke: color,
          strokeWidth: hoverMatches && edgeFocusLayer !== undefined ? 2.75 : 2,
          strokeDasharray: edge.violating ? '6 5' : undefined,
          opacity: hoverDimmed ? 0.12 : 1,
          pointerEvents: 'none',
        },
        zIndex: 3,
      });
    }

  return { nodes, edges };
}
