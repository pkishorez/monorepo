import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

import {
  computeLayerRanks,
  flattenRules,
  graphGroups,
  layerHosts,
  mergeConfiguredLayerEdges,
  type GraphGroup,
} from '../../architecture-graph';
import { resolveLayerFocus } from '../focus';
import type { NamedLayerGraph } from '../../analysis-presentation';
import type {
  Layer,
  LayerInteraction,
  LayerRule,
  LayerViolationPair,
} from '../../analysis-presentation';
import { resolveGraphFocus, ruleId } from './focus';

const layerWidth = 176;
const layerHeight = 52;
const headerWidth = 176;
const headerHeight = 44;
const lanePadding = 32;
const laneGap = 72;
const siblingGap = 24;
const rankGap = 72;
const layerOffsetY = 80;

export interface LayerNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly softlyDimmed: boolean;
  readonly violation: boolean;
  readonly hoverEnabled: boolean;
  readonly activationEnabled: boolean;
  readonly openEnabled: boolean;
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
  readonly openable: boolean;
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
  readonly isolatedLayerGraphId?: string;
  readonly showLayerConnections?: boolean;
  readonly onLayerGraphActivate?: (graphId: string) => void;
  readonly onLayerGraphOpen?: (graphId: string) => void;
  readonly activeViolationPair?: LayerViolationPair;
}

interface LaneLayout {
  readonly id: string;
  readonly x: number;
  readonly width: number;
  readonly center: number;
}

interface Slot {
  readonly x: number;
  readonly y: number;
}

export function layoutGraph(input: GraphLayoutInput): {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
} {
  const groups = graphGroups(input);
  const hosts = layerHosts(groups);
  const configuredEdges = mergeConfiguredLayerEdges(groups);
  const ranks = computeLayerRanks(input.layers, configuredEdges);
  const lanes = computeLanes(groups, ranks);
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const slots = computeSlots(groups, ranks, laneById);
  const laneHeight = computeLaneHeight(slots);
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
  const laneDimmed = (graphId: string): boolean =>
    input.activeLayerGraphId !== undefined &&
    input.activeLayerGraphId !== graphId;
  // Selecting a LayerGraph asks what it is made of *and* what it leans on, so
  // the Layers it reaches stay lit in their own lanes instead of dimming away.
  const selected = groups.find(({ id }) => id === input.activeLayerGraphId);
  const selectedLayerIds =
    selected === undefined
      ? undefined
      : new Set([...selected.layerIds, ...selected.reachedLayerIds]);
  const reachedBySelection = new Set(selected?.reachedLayerIds ?? []);
  const nodes: GraphNode[] = [];

  for (const group of groups) {
    const lane = laneById.get(group.id)!;
    const dimmed = laneDimmed(group.id);
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
        openable: input.onLayerGraphOpen !== undefined,
        ...(group.description === undefined
          ? {}
          : { description: group.description }),
      },
    });
  }

  for (const layer of input.layers) {
    const slot = slots.get(layer.id);
    if (slot === undefined) continue;
    nodes.push({
      id: layer.id,
      type: 'layer',
      position: slot,
      width: layerWidth,
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
          reachedBySelection.has(layer.id) ||
          (focus.focusedLayerId !== undefined &&
            focus.focusedLayerId !== layer.id &&
            focus.highlightedLayerIds.has(layer.id)),
        dimmed:
          ((selectedLayerIds !== undefined &&
            !selectedLayerIds.has(layer.id)) ||
            hasFocus) &&
          !focus.highlightedLayerIds.has(layer.id),
        softlyDimmed:
          focus.hoveredRelatedLayerId !== undefined &&
          focus.highlightedLayerIds.has(layer.id) &&
          layer.id !== focus.focusedLayerId &&
          layer.id !== focus.hoveredRelatedLayerId,
        violation: violationLayerIds.has(layer.id),
        hoverEnabled: interaction.hoverEnabled,
        activationEnabled: interaction.activationEnabled,
        openEnabled: input.onLayerOpen !== undefined,
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
      .map((layerId): Edge => ({
        id: `membership:${group.id}->${layerId}`,
        source: `graph:${group.id}`,
        target: layerId,
        sourceHandle: 'source-bottom',
        targetHandle: 'target-top',
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
      }));
  });

  // A Rule points at the one real Layer it names, wherever that Layer is drawn,
  // so a Rule leaving its lane crosses the canvas rather than landing on a stub.
  // Merged first: two LayerGraphs declaring the same Rule draw one line.
  if (input.showLayerConnections !== false) {
    for (const edge of configuredEdges) {
      const { fromLayerId, toLayerId } = edge;
      if (!slots.has(fromLayerId) || !slots.has(toLayerId)) continue;
      const id = ruleId(fromLayerId, toLayerId);
      const highlighted = focus.highlightedRuleIds.has(id);
      const emphasized = focus.emphasizedRuleIds.has(id);
      const outsideSelection =
        input.activeLayerGraphId !== undefined &&
        !edge.graphIds.includes(input.activeLayerGraphId);
      const crosses = hosts.get(fromLayerId) !== hosts.get(toLayerId);
      edges.push({
        id: `configured:${fromLayerId}->${toLayerId}`,
        source: fromLayerId,
        target: toLayerId,
        ...connectionHandles(slots, fromLayerId, toLayerId),
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        interactionWidth: 0,
        selectable: false,
        focusable: false,
        className: 'pointer-events-none',
        style: {
          stroke: highlighted ? 'var(--primary)' : 'var(--muted-foreground)',
          strokeWidth: highlighted ? 2 : 1.25,
          // A Rule that leaves its lane is dashed, so the eye can tell a
          // dependency inside one responsibility from one that reaches out.
          ...(crosses ? { strokeDasharray: '6 4' } : {}),
          opacity:
            focus.hoveredRelatedLayerId !== undefined && !emphasized
              ? 0
              : outsideSelection
                ? 0.05
                : hasFocus && !highlighted
                  ? 0
                  : 1,
          pointerEvents: 'none',
        },
        zIndex: crosses ? 2 : 1,
      });
    }
  }

  // A Violation is a dependency no Rule permits. It crosses the canvas above
  // everything else.
  if (
    input.activeViolationPair !== undefined &&
    slots.has(input.activeViolationPair.fromLayerId) &&
    slots.has(input.activeViolationPair.toLayerId)
  ) {
    edges.push({
      id: `violation:${input.activeViolationPair.id}`,
      source: input.activeViolationPair.fromLayerId,
      target: input.activeViolationPair.toLayerId,
      ...connectionHandles(
        slots,
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
      zIndex: 5,
    });
  }

  return { nodes, edges };
}

// A lane is as wide as its busiest rank row of hosted Layers.
function computeLanes(
  groups: readonly GraphGroup[],
  ranks: ReadonlyMap<string, number>,
): readonly LaneLayout[] {
  let nextX = 0;
  return groups.map((graph) => {
    const counts = new Map<number, number>();
    for (const layerId of graph.layerIds) {
      const rank = ranks.get(layerId) ?? 0;
      counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    const widest = Math.max(1, ...counts.values());
    const width =
      widest * layerWidth + (widest - 1) * siblingGap + lanePadding * 2;
    const lane = { id: graph.id, x: nextX, width, center: nextX + width / 2 };
    nextX += width + laneGap;
    return lane;
  });
}

function computeSlots(
  groups: readonly GraphGroup[],
  ranks: ReadonlyMap<string, number>,
  laneById: ReadonlyMap<string, LaneLayout>,
): ReadonlyMap<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const graph of groups) {
    const lane = laneById.get(graph.id)!;
    const byRank = new Map<number, string[]>();
    const place = (layerId: string, nodeId: string): void => {
      const rank = ranks.get(layerId) ?? 0;
      const row = byRank.get(rank) ?? [];
      row.push(nodeId);
      byRank.set(rank, row);
    };
    for (const layerId of graph.layerIds) place(layerId, layerId);
    for (const [rank, row] of byRank) {
      row.forEach((nodeId, index) => {
        slots.set(nodeId, {
          x:
            lane.center -
            layerWidth / 2 +
            (index - (row.length - 1) / 2) * (layerWidth + siblingGap),
          y: layerOffsetY + rank * (layerHeight + rankGap),
        });
      });
    }
  }
  return slots;
}

function computeLaneHeight(slots: ReadonlyMap<string, Slot>): number {
  return (
    Math.max(layerOffsetY, ...[...slots.values()].map(({ y }) => y)) +
    layerHeight +
    36
  );
}

function connectionHandles(
  slots: ReadonlyMap<string, Slot>,
  sourceId: string,
  targetId: string,
): { readonly sourceHandle: string; readonly targetHandle: string } {
  const source = slots.get(sourceId)!;
  const target = slots.get(targetId)!;
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;

  if (Math.abs(deltaY) < layerHeight) {
    return deltaX >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }
  if (deltaY > 0) {
    if (deltaX > layerWidth / 3) {
      return {
        sourceHandle: 'source-bottom-right',
        targetHandle: 'target-top-left',
      };
    }
    if (deltaX < -layerWidth / 3) {
      return {
        sourceHandle: 'source-bottom-left',
        targetHandle: 'target-top-right',
      };
    }
    return { sourceHandle: 'source-bottom', targetHandle: 'target-top' };
  }
  if (deltaX > layerWidth / 3) {
    return { sourceHandle: 'source-right', targetHandle: 'target-left' };
  }
  if (deltaX < -layerWidth / 3) {
    return { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }
  return { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}
