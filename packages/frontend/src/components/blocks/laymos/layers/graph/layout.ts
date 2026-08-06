import dagre from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

import type {
  Layer,
  LayerInteraction,
  LayerRule,
  LayerViolationPair,
} from '../model';
import { resolveLayerFocus } from '../focus';
import { resolveGraphFocus, ruleId } from './focus';
import type { RoutedGraphEdge } from './routed-edge';

const nodeWidth = 176;
const nodeHeight = 52;

export interface GraphNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly focused: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly violation: boolean;
  readonly hoverEnabled: boolean;
  readonly activationEnabled: boolean;
  readonly incomingPortIds: readonly string[];
  readonly outgoingPortIds: readonly string[];
  readonly onHoverChange?: (layerId: string | undefined) => void;
  readonly onActivate?: (layerId: string) => void;
}

export type GraphNode = Node<GraphNodeData, 'layer'>;

interface GraphLayoutInput extends LayerInteraction {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly activeViolationPair?: LayerViolationPair;
}

export function layoutGraph(input: GraphLayoutInput): {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
} {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'TB',
    ranksep: 72,
    nodesep: 36,
    marginx: 24,
    marginy: 24,
  });

  const layerIds = new Set(input.layers.map((layer) => layer.id));
  for (const layer of input.layers) {
    graph.setNode(layer.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const rule of flattenRules(input.rules)) {
    if (layerIds.has(rule.fromLayerId) && layerIds.has(rule.toLayerId)) {
      graph.setEdge(rule.fromLayerId, rule.toLayerId);
    }
  }
  dagre.layout(graph);

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
  const connections = visibleConnections(input, layerIds);
  const ports = collectPorts(input.layers, connections);

  const nodes = input.layers.map((layer): GraphNode => {
    const position = graph.node(layer.id) as { x: number; y: number };
    return {
      id: layer.id,
      type: 'layer',
      position: {
        x: position.x - nodeWidth / 2,
        y: position.y - nodeHeight / 2,
      },
      width: nodeWidth,
      height: nodeHeight,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        label: layer.id,
        focused: focus.focusedLayerId === layer.id,
        related:
          focus.focusedLayerId !== undefined &&
          focus.focusedLayerId !== layer.id &&
          focus.highlightedLayerIds.has(layer.id),
        dimmed: hasFocus && !focus.highlightedLayerIds.has(layer.id),
        violation: violationLayerIds.has(layer.id),
        hoverEnabled: interaction.hoverEnabled,
        activationEnabled: interaction.activationEnabled,
        incomingPortIds: ports.get(layer.id)?.incoming ?? [],
        outgoingPortIds: ports.get(layer.id)?.outgoing ?? [],
        onHoverChange: input.onLayerHoverChange,
        onActivate: input.onLayerActivate,
      },
    };
  });

  const edges = flattenRules(input.rules)
    .filter(
      (rule) => layerIds.has(rule.fromLayerId) && layerIds.has(rule.toLayerId),
    )
    .map((rule): Edge => {
      const id = ruleId(rule.fromLayerId, rule.toLayerId);
      const highlighted = focus.highlightedRuleIds.has(id);
      const route = graph.edge({
        v: rule.fromLayerId,
        w: rule.toLayerId,
      }) as
        | { readonly points?: readonly { x: number; y: number }[] }
        | undefined;
      return {
        id,
        source: rule.fromLayerId,
        target: rule.toLayerId,
        sourceHandle: portId(rule.fromLayerId, rule.toLayerId, 'outgoing'),
        targetHandle: portId(rule.fromLayerId, rule.toLayerId, 'incoming'),
        type: 'routed',
        data: { points: route?.points ?? [] },
        markerEnd: { type: MarkerType.ArrowClosed },
        selectable: false,
        focusable: false,
        ...(hasFocus && !highlighted ? { className: 'opacity-5' } : {}),
        style: highlighted
          ? { stroke: 'var(--primary)', strokeWidth: 2 }
          : { stroke: 'var(--muted-foreground)', strokeWidth: 1.25 },
      } satisfies RoutedGraphEdge;
    });

  if (
    input.activeViolationPair !== undefined &&
    layerIds.has(input.activeViolationPair.fromLayerId) &&
    layerIds.has(input.activeViolationPair.toLayerId)
  ) {
    const sourceNode = nodes.find(
      (node) => node.id === input.activeViolationPair?.fromLayerId,
    );
    const targetNode = nodes.find(
      (node) => node.id === input.activeViolationPair?.toLayerId,
    );
    edges.push({
      id: `violation:${input.activeViolationPair.id}`,
      source: input.activeViolationPair.fromLayerId,
      target: input.activeViolationPair.toLayerId,
      sourceHandle: portId(
        input.activeViolationPair.fromLayerId,
        input.activeViolationPair.toLayerId,
        'outgoing',
      ),
      targetHandle: portId(
        input.activeViolationPair.fromLayerId,
        input.activeViolationPair.toLayerId,
        'incoming',
      ),
      type: 'routed',
      data: {
        points:
          sourceNode === undefined || targetNode === undefined
            ? []
            : directConnection(sourceNode, targetNode),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--destructive)' },
      selectable: false,
      focusable: false,
      style: { stroke: 'var(--destructive)', strokeWidth: 2.5 },
      zIndex: 2,
    });
  }

  return { nodes, edges };
}

function directConnection(
  source: Pick<GraphNode, 'position'>,
  target: Pick<GraphNode, 'position'>,
): readonly { x: number; y: number }[] {
  const sourceCenter = {
    x: source.position.x + nodeWidth / 2,
    y: source.position.y + nodeHeight / 2,
  };
  const targetCenter = {
    x: target.position.x + nodeWidth / 2,
    y: target.position.y + nodeHeight / 2,
  };

  return [
    rectangleBoundary(sourceCenter, targetCenter),
    rectangleBoundary(targetCenter, sourceCenter),
  ];
}

function rectangleBoundary(
  origin: { readonly x: number; readonly y: number },
  destination: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const x = destination.x - origin.x;
  const y = destination.y - origin.y;
  if (x === 0 && y === 0) return origin;
  const scale =
    1 / Math.max(Math.abs(x) / (nodeWidth / 2), Math.abs(y) / (nodeHeight / 2));
  return { x: origin.x + x * scale, y: origin.y + y * scale };
}

function portId(
  fromLayerId: string,
  toLayerId: string,
  direction: 'incoming' | 'outgoing',
): string {
  return `${direction}:${ruleId(fromLayerId, toLayerId)}`;
}

function visibleConnections(
  input: Pick<GraphLayoutInput, 'rules' | 'activeViolationPair'>,
  layerIds: ReadonlySet<string>,
): readonly { fromLayerId: string; toLayerId: string }[] {
  const connections = flattenRules(input.rules).filter(
    (rule) => layerIds.has(rule.fromLayerId) && layerIds.has(rule.toLayerId),
  );

  if (
    input.activeViolationPair === undefined ||
    !layerIds.has(input.activeViolationPair.fromLayerId) ||
    !layerIds.has(input.activeViolationPair.toLayerId)
  ) {
    return connections;
  }

  const violation = {
    fromLayerId: input.activeViolationPair.fromLayerId,
    toLayerId: input.activeViolationPair.toLayerId,
  };
  return connections.some(
    (rule) =>
      rule.fromLayerId === violation.fromLayerId &&
      rule.toLayerId === violation.toLayerId,
  )
    ? connections
    : [...connections, violation];
}

function collectPorts(
  layers: readonly Layer[],
  connections: readonly { fromLayerId: string; toLayerId: string }[],
): ReadonlyMap<
  string,
  { readonly incoming: readonly string[]; readonly outgoing: readonly string[] }
> {
  const ports = new Map<string, { incoming: string[]; outgoing: string[] }>(
    layers.map((layer) => [layer.id, { incoming: [], outgoing: [] }]),
  );

  for (const connection of connections) {
    ports
      .get(connection.fromLayerId)
      ?.outgoing.push(
        portId(connection.fromLayerId, connection.toLayerId, 'outgoing'),
      );
    ports
      .get(connection.toLayerId)
      ?.incoming.push(
        portId(connection.fromLayerId, connection.toLayerId, 'incoming'),
      );
  }

  for (const nodePorts of ports.values()) {
    nodePorts.incoming.sort();
    nodePorts.outgoing.sort();
  }
  return ports;
}

export function graphIdentity(
  layers: readonly Layer[],
  rules: readonly LayerRule[],
): string {
  return JSON.stringify([
    layers.map((layer) => layer.id),
    flattenRules(rules).map((rule) => [rule.fromLayerId, rule.toLayerId]),
  ]);
}

function flattenRules(
  rules: readonly LayerRule[],
): readonly { fromLayerId: string; toLayerId: string }[] {
  return rules.flatMap((rule) =>
    rule.toLayerIds.map((toLayerId) => ({
      fromLayerId: rule.fromLayerId,
      toLayerId,
    })),
  );
}
