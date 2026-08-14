import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

import {
  computeLayerRanks,
  flattenRules,
  graphGroups,
  graphMemberships,
  mergeConfiguredLayerEdges,
  type GraphGroup,
} from '../../graph-engine';
import { resolveLayerFocus } from '../focus';
import type { NamedLayerGraph } from '../layer-graphs';
import type {
  Layer,
  LayerInteraction,
  LayerRule,
  LayerViolationPair,
} from '../model';
import { resolveGraphFocus, ruleId } from './focus';

const layerWidth = 176;
const layerHeight = 52;
const headerWidth = 176;
const headerHeight = 44;
const lanePadding = 32;
const laneGap = 72;
const siblingGap = 24;
const rankRowGap = 20;
const rankGap = 72;
const layerOffsetY = 80;

export interface LayerNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly violation: boolean;
  readonly shared: boolean;
  readonly hoverEnabled: boolean;
  readonly activationEnabled: boolean;
  readonly openEnabled: boolean;
  readonly targetHandles: readonly { id: string; offset: number }[];
  readonly onHoverChange?: (layerId: string | undefined) => void;
  readonly onActivate?: (layerId: string) => void;
  readonly onOpen?: (layerId: string) => void;
}

export interface LaneNodeData extends Record<string, unknown> {
  readonly dimmed: boolean;
}

export interface GraphHeaderNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly description?: string;
  readonly dimmed: boolean;
  readonly active: boolean;
  readonly activatable: boolean;
}

export type LayerGraphNode = Node<LayerNodeData, 'layer'>;
export type LaneGraphNode = Node<LaneNodeData, 'lane'>;
export type GraphHeaderNode = Node<GraphHeaderNodeData, 'graph-header'>;
export type GraphNode = LayerGraphNode | LaneGraphNode | GraphHeaderNode;

interface GraphLayoutInput extends LayerInteraction {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly activeLayerGraphId?: string;
  readonly showLayerConnections?: boolean;
  readonly onLayerGraphActivate?: (graphId: string) => void;
  readonly activeViolationPair?: LayerViolationPair;
}

interface LaneLayout {
  readonly id: string;
  readonly x: number;
  readonly width: number;
  readonly center: number;
}

interface LayerPosition {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export function layoutGraph(input: GraphLayoutInput): {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
} {
  const groups = graphGroups(input);
  const memberships = graphMemberships(groups);
  const configuredEdges = mergeConfiguredLayerEdges(groups);
  const ranks = computeLayerRanks(input.layers, configuredEdges);
  const lanes = computeLanes(groups, memberships, ranks);
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const positions = computeLayerPositions(
    input.layers,
    groups,
    memberships,
    ranks,
    laneById,
  );
  const laneHeight = computeLaneHeight(positions);
  const focus = resolveGraphFocus(input);
  const interaction = resolveLayerFocus({
    activeLayerId: input.activeLayerId,
    hoveredLayerId: input.hoveredLayerId,
    blocked: input.activeViolationPair !== undefined,
  });
  const hasFocus =
    focus.focusedLayerId !== undefined || focus.violationRuleId !== undefined;
  const violationLayerIds = new Set(
    input.activeViolationPair === undefined
      ? []
      : [
          input.activeViolationPair.fromLayerId,
          input.activeViolationPair.toLayerId,
        ],
  );
  const selectedGraphLayerIds =
    input.activeLayerGraphId === undefined
      ? undefined
      : new Set(
          groups.find(({ id }) => id === input.activeLayerGraphId)?.layerIds ??
            [],
        );
  const nodes: GraphNode[] = [];

  for (const group of groups) {
    const lane = laneById.get(group.id)!;
    const dimmed =
      input.activeLayerGraphId !== undefined &&
      input.activeLayerGraphId !== group.id;
    nodes.push({
      id: `lane:${group.id}`,
      type: 'lane',
      position: { x: lane.x, y: 0 },
      width: lane.width,
      height: laneHeight,
      selectable: false,
      focusable: false,
      draggable: false,
      zIndex: -1,
      style: { pointerEvents: 'none' },
      data: { dimmed },
    });
    nodes.push({
      id: `graph:${group.id}`,
      type: 'graph-header',
      position: { x: lane.center - headerWidth / 2, y: 18 },
      width: headerWidth,
      height: headerHeight,
      selectable: false,
      focusable: false,
      draggable: false,
      zIndex: 4,
      data: {
        label: group.id,
        dimmed,
        active: input.activeLayerGraphId === group.id,
        activatable: input.onLayerGraphActivate !== undefined,
        ...(group.description === undefined
          ? {}
          : { description: group.description }),
      },
    });
  }

  for (const layer of input.layers) {
    const position = positions.get(layer.id);
    if (position === undefined) continue;
    const graphIds = memberships.get(layer.id) ?? [];
    const memberLanes = graphIds.flatMap((id) => {
      const lane = laneById.get(id);
      return lane === undefined ? [] : [lane];
    });
    const outsideSelectedGraph =
      selectedGraphLayerIds !== undefined &&
      !selectedGraphLayerIds.has(layer.id);
    nodes.push({
      id: layer.id,
      type: 'layer',
      position: { x: position.x, y: position.y },
      width: position.width,
      height: layerHeight,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 4,
      data: {
        label: layer.id,
        focused: focus.focusedLayerId === layer.id,
        related:
          focus.focusedLayerId !== undefined &&
          focus.focusedLayerId !== layer.id &&
          focus.highlightedLayerIds.has(layer.id),
        dimmed:
          (outsideSelectedGraph || hasFocus) &&
          !focus.highlightedLayerIds.has(layer.id),
        softlyDimmed:
          focus.hoveredRelatedLayerId !== undefined &&
          focus.highlightedLayerIds.has(layer.id) &&
          layer.id !== focus.focusedLayerId &&
          layer.id !== focus.hoveredRelatedLayerId,
        violation: violationLayerIds.has(layer.id),
        shared: graphIds.length > 1,
        hoverEnabled: interaction.hoverEnabled,
        activationEnabled: interaction.activationEnabled,
        openEnabled: input.onLayerOpen !== undefined,
        targetHandles:
          graphIds.length < 2
            ? []
            : memberLanes.map((lane) => ({
                id: `target-${lane.id}`,
                offset: ((lane.center - position.x) / position.width) * 100,
              })),
        onHoverChange: input.onLayerHoverChange,
        onActivate: input.onLayerActivate,
        onOpen: input.onLayerOpen,
      },
    });
  }

  const edges: Edge[] = groups.flatMap((group) => {
    const targets = new Set(
      flattenRules(group.rules).map(({ toLayerId }) => toLayerId),
    );
    return group.layerIds
      .filter((layerId) => !targets.has(layerId))
      .map(
        (layerId): Edge => ({
          id: `membership:${group.id}->${layerId}`,
          source: `graph:${group.id}`,
          target: layerId,
          sourceHandle: 'source-bottom',
          targetHandle:
            (memberships.get(layerId)?.length ?? 0) > 1
              ? `target-${group.id}`
              : 'target-top',
          type: 'smoothstep',
          markerEnd: undefined,
          interactionWidth: 0,
          className: 'pointer-events-none',
          style: {
            stroke: 'var(--muted-foreground)',
            strokeWidth: 1,
            strokeDasharray: '3 5',
            opacity: hasFocus
              ? 0
              : input.activeLayerGraphId === undefined ||
                  input.activeLayerGraphId === group.id
                ? 0.3
                : 0.06,
            pointerEvents: 'none',
          },
          zIndex: 0,
        }),
      );
  });

  const visibleConfiguredEdges =
    input.showLayerConnections === false ? [] : configuredEdges;
  edges.push(
    ...visibleConfiguredEdges.map((edge): Edge => {
      const id = ruleId(edge.fromLayerId, edge.toLayerId);
      const highlighted = focus.highlightedRuleIds.has(id);
      const emphasized = focus.emphasizedRuleIds.has(id);
      const outsideSelectedGraph =
        input.activeLayerGraphId !== undefined &&
        !edge.graphIds.includes(input.activeLayerGraphId);
      const routingGraphId =
        edge.graphIds.length === 1 ? edge.graphIds[0] : undefined;
      return {
        id: `configured:${edge.graphIds.join('+')}:${edge.fromLayerId}->${edge.toLayerId}`,
        source: edge.fromLayerId,
        target: edge.toLayerId,
        ...connectionHandles(
          positions,
          memberships,
          edge.fromLayerId,
          edge.toLayerId,
          routingGraphId,
        ),
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        interactionWidth: 0,
        selectable: false,
        focusable: false,
        className: 'pointer-events-none',
        style: {
          stroke: highlighted ? 'var(--primary)' : 'var(--muted-foreground)',
          strokeWidth: highlighted ? 2 : 1.25,
          opacity:
            focus.hoveredRelatedLayerId !== undefined && !emphasized
              ? 0
              : outsideSelectedGraph
                ? 0.05
                : hasFocus && !highlighted
                  ? 0
                  : 1,
          pointerEvents: 'none',
        },
        zIndex: 1,
      };
    }),
  );

  if (
    input.activeViolationPair !== undefined &&
    positions.has(input.activeViolationPair.fromLayerId) &&
    positions.has(input.activeViolationPair.toLayerId)
  ) {
    edges.push({
      id: `violation:${input.activeViolationPair.id}`,
      source: input.activeViolationPair.fromLayerId,
      target: input.activeViolationPair.toLayerId,
      ...connectionHandles(
        positions,
        memberships,
        input.activeViolationPair.fromLayerId,
        input.activeViolationPair.toLayerId,
      ),
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--destructive)' },
      interactionWidth: 0,
      selectable: false,
      focusable: false,
      className: 'pointer-events-none',
      style: {
        stroke: 'var(--destructive)',
        strokeWidth: 2.5,
        pointerEvents: 'none',
      },
      zIndex: 2,
    });
  }

  return { nodes, edges };
}

function computeLanes(
  groups: readonly GraphGroup[],
  memberships: ReadonlyMap<string, readonly string[]>,
  ranks: ReadonlyMap<string, number>,
): readonly LaneLayout[] {
  let nextX = 0;
  return groups.map((graph) => {
    const counts = new Map<number, number>();
    for (const layerId of graph.layerIds) {
      if ((memberships.get(layerId)?.length ?? 0) > 1) continue;
      const rank = ranks.get(layerId) ?? 0;
      counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    const maxSiblings = Math.max(1, ...counts.values());
    const width =
      maxSiblings * layerWidth +
      (maxSiblings - 1) * siblingGap +
      lanePadding * 2;
    const lane = {
      id: graph.id,
      x: nextX,
      width,
      center: nextX + width / 2,
    };
    nextX += width + laneGap;
    return lane;
  });
}

function computeLayerPositions(
  layers: readonly Layer[],
  groups: readonly GraphGroup[],
  memberships: ReadonlyMap<string, readonly string[]>,
  ranks: ReadonlyMap<string, number>,
  laneById: ReadonlyMap<string, LaneLayout>,
): ReadonlyMap<string, LayerPosition> {
  const positions = new Map<string, LayerPosition>();
  for (const graph of groups) {
    const lane = laneById.get(graph.id)!;
    const byRank = new Map<number, string[]>();
    for (const layerId of graph.layerIds) {
      if ((memberships.get(layerId)?.length ?? 0) > 1) continue;
      const rank = ranks.get(layerId) ?? 0;
      const siblings = byRank.get(rank) ?? [];
      siblings.push(layerId);
      byRank.set(rank, siblings);
    }
    for (const [rank, siblings] of byRank) {
      siblings.forEach((layerId, index) => {
        positions.set(layerId, {
          x:
            lane.center -
            layerWidth / 2 +
            (index - (siblings.length - 1) / 2) * (layerWidth + siblingGap),
          y: layerOffsetY + rank * (layerHeight + rankGap),
          width: layerWidth,
        });
      });
    }
  }

  for (const layer of layers) {
    const graphIds = memberships.get(layer.id) ?? [];
    if (graphIds.length < 2) continue;
    const memberLanes = graphIds.flatMap((id) => {
      const lane = laneById.get(id);
      return lane === undefined ? [] : [lane];
    });
    const left = Math.min(...memberLanes.map(({ center }) => center));
    const right = Math.max(...memberLanes.map(({ center }) => center));
    positions.set(layer.id, {
      x: left - layerWidth / 2,
      y: layerOffsetY + (ranks.get(layer.id) ?? 0) * (layerHeight + rankGap),
      width: right - left + layerWidth,
    });
  }

  let nextRankY = layerOffsetY;
  const maxRank = Math.max(0, ...ranks.values());
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const layersAtRank = layers
      .filter((layer) => (ranks.get(layer.id) ?? 0) === rank)
      .flatMap((layer) => {
        const position = positions.get(layer.id);
        return position === undefined ? [] : [{ layer, position }];
      })
      .sort(
        (left, right) =>
          left.position.x - right.position.x ||
          right.position.width - left.position.width,
      );
    const rowEnds: number[] = [];
    for (const { layer, position } of layersAtRank) {
      let row = rowEnds.findIndex((end) => position.x >= end + siblingGap);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = position.x + position.width;
      positions.set(layer.id, {
        ...position,
        y: nextRankY + row * (layerHeight + rankRowGap),
      });
    }
    const rowCount = Math.max(1, rowEnds.length);
    nextRankY += rowCount * layerHeight + (rowCount - 1) * rankRowGap + rankGap;
  }
  return positions;
}

function computeLaneHeight(
  positions: ReadonlyMap<string, LayerPosition>,
): number {
  return (
    Math.max(layerOffsetY, ...[...positions.values()].map(({ y }) => y)) +
    layerHeight +
    36
  );
}

function connectionHandles(
  positions: ReadonlyMap<string, LayerPosition>,
  memberships: ReadonlyMap<string, readonly string[]>,
  fromLayerId: string,
  toLayerId: string,
  graphId?: string,
): { readonly sourceHandle: string; readonly targetHandle: string } {
  const source = positions.get(fromLayerId)!;
  const target = positions.get(toLayerId)!;
  const deltaX = target.x + target.width / 2 - (source.x + source.width / 2);
  const deltaY = target.y - source.y;
  const sharedTarget =
    graphId !== undefined && (memberships.get(toLayerId)?.length ?? 0) > 1
      ? `target-${graphId}`
      : undefined;

  if (Math.abs(deltaY) < layerHeight) {
    return deltaX >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }
  if (deltaY > 0) {
    if (deltaX > layerWidth / 3) {
      return {
        sourceHandle: 'source-bottom-right',
        targetHandle: sharedTarget ?? 'target-top-left',
      };
    }
    if (deltaX < -layerWidth / 3) {
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
  if (deltaX > layerWidth / 3) {
    return { sourceHandle: 'source-right', targetHandle: 'target-left' };
  }
  if (deltaX < -layerWidth / 3) {
    return { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }
  return { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}
