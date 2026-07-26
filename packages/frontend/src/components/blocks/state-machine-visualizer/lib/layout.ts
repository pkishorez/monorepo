import type {
  ElkExtendedEdge,
  ElkNode,
  ElkPoint,
  ElkPort,
} from 'elkjs/lib/elk.bundled.js';

import type {
  SerializedStateMachine,
  SerializedStateMachineNode,
  StateMachineLayout,
  StateMachineLayoutOptions,
  StateMachinePoint,
  StateMachineSceneEdge,
  StateMachineSceneEdgeSection,
  StateMachineSceneNode,
} from '../types';
import {
  COLLAPSED_STATE_HEIGHT,
  CONTAINER_HEADER_GAP,
  CONTAINER_HEADER_HEIGHT,
  CONTAINER_PADDING,
  INITIAL_INDICATOR_SIZE,
  STATE_HEIGHT,
  STATE_WIDTH,
  getEdgeLabelSize,
} from './metrics';

interface DiagramNode {
  readonly id: string;
  readonly parentId?: string;
  readonly state?: SerializedStateMachineNode;
}

interface DiagramEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly initial: boolean;
  readonly labelSize: { readonly width: number; readonly height: number };
}

export const TARGET_TOLERANCE = 3;

type Elk = InstanceType<(typeof import('elkjs/lib/elk.bundled.js'))['default']>;

let elkInstance: Promise<Elk> | undefined;

function getElk(): Promise<Elk> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js').then(
    (module) => new module.default(),
  );
  return elkInstance;
}

function createAncestorLookup(nodesById: ReadonlyMap<string, DiagramNode>) {
  const chains = new Map<string, readonly (string | undefined)[]>();
  const sets = new Map<string, ReadonlySet<string | undefined>>();

  function chain(nodeId: string): readonly (string | undefined)[] {
    const cached = chains.get(nodeId);
    if (cached) return cached;

    const parentId = nodesById.get(nodeId)?.parentId;
    const value =
      parentId === undefined ? [undefined] : [parentId, ...chain(parentId)];
    chains.set(nodeId, value);
    return value;
  }

  function set(nodeId: string): ReadonlySet<string | undefined> {
    const cached = sets.get(nodeId);
    if (cached) return cached;

    const value = new Set(chain(nodeId));
    sets.set(nodeId, value);
    return value;
  }

  return { chain, set };
}

function getPortId(nodeId: string, edgeId: string, direction: 'in' | 'out') {
  return `${nodeId}:${direction}:${edgeId}`;
}

function assignLayers(
  childrenByParent: ReadonlyMap<string | undefined, readonly DiagramNode[]>,
  nodesById: ReadonlyMap<string, DiagramNode>,
  edges: readonly DiagramEdge[],
): ReadonlyMap<string, number> {
  const siblingEdges = new Map<string | undefined, DiagramEdge[]>();

  for (const edge of edges) {
    const parentId = nodesById.get(edge.source)?.parentId;
    if (parentId !== nodesById.get(edge.target)?.parentId) continue;

    const group = siblingEdges.get(parentId) ?? [];
    group.push(edge);
    siblingEdges.set(parentId, group);
  }

  const layers = new Map<string, number>();

  for (const [parentId, siblings] of childrenByParent) {
    const siblingsById = new Map(siblings.map((node) => [node.id, node]));
    const outgoing = new Map<string, DiagramEdge[]>();
    const reachable = new Set<string>();

    for (const edge of siblingEdges.get(parentId) ?? []) {
      const nodeEdges = outgoing.get(edge.source) ?? [];
      nodeEdges.push(edge);
      outgoing.set(edge.source, nodeEdges);
      reachable.add(edge.target);
    }

    const queue = siblings.filter((node) => node.state === undefined);
    if (queue.length === 0) {
      queue.push(...siblings.filter((node) => !reachable.has(node.id)));
    }

    for (const node of queue) layers.set(node.id, 0);

    while (queue.length > 0) {
      const source = queue.shift()!;

      for (const edge of outgoing.get(source.id) ?? []) {
        const target = siblingsById.get(edge.target);
        if (!target || layers.has(target.id)) continue;
        layers.set(target.id, (layers.get(source.id) ?? 0) + 1);
        queue.push(target);
      }
    }

    for (const node of siblings) {
      if (!layers.has(node.id)) layers.set(node.id, 0);
    }
  }

  return layers;
}

function toElkGraph(
  machine: SerializedStateMachine,
  options: StateMachineLayoutOptions,
): {
  readonly graph: ElkNode;
  readonly nodesById: ReadonlyMap<string, DiagramNode>;
  readonly edgesById: ReadonlyMap<string, DiagramEdge>;
} {
  const diagramNodes: DiagramNode[] = machine.nodes.map((state) => ({
    id: state.id,
    parentId: state.parentId,
    state,
  }));
  const diagramEdges: DiagramEdge[] = machine.edges.map((edge) => ({
    ...edge,
    initial: false,
    labelSize: getEdgeLabelSize(edge.label),
  }));

  for (const state of machine.nodes.filter((node) => node.initial)) {
    const indicatorId = `${state.id}:initial-indicator`;
    diagramNodes.push({ id: indicatorId, parentId: state.parentId });
    diagramEdges.push({
      id: `${state.id}:initial-transition`,
      source: indicatorId,
      target: state.id,
      label: '',
      initial: true,
      labelSize: getEdgeLabelSize(''),
    });
  }

  const nodesById = new Map(diagramNodes.map((node) => [node.id, node]));
  const edgesById = new Map(diagramEdges.map((edge) => [edge.id, edge]));
  const childrenByParent = new Map<string | undefined, DiagramNode[]>();

  for (const node of diagramNodes) {
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const layers = assignLayers(childrenByParent, nodesById, diagramEdges);

  for (const children of childrenByParent.values()) {
    children.sort(
      (left, right) => (layers.get(left.id) ?? 0) - (layers.get(right.id) ?? 0),
    );
  }

  const ancestors = createAncestorLookup(nodesById);
  const edgesByContainer = new Map<string | undefined, DiagramEdge[]>();
  const connectedEdges = new Map<string, DiagramEdge[]>();
  const useDedicatedPorts =
    options.wrappingStrategy === undefined ||
    options.wrappingStrategy === 'OFF';
  const includeLabels = options.wrappingStrategy !== 'SINGLE_EDGE';

  function connect(nodeId: string, edge: DiagramEdge) {
    const nodeEdges = connectedEdges.get(nodeId) ?? [];
    nodeEdges.push(edge);
    connectedEdges.set(nodeId, nodeEdges);
  }

  for (const edge of diagramEdges) {
    const targetAncestors = ancestors.set(edge.target);
    const container = ancestors
      .chain(edge.source)
      .find((ancestor) => targetAncestors.has(ancestor));
    const containerEdges = edgesByContainer.get(container) ?? [];
    containerEdges.push(edge);
    edgesByContainer.set(container, containerEdges);

    connect(edge.source, edge);
    if (edge.target !== edge.source) connect(edge.target, edge);
  }

  function buildEdge(edge: DiagramEdge): ElkExtendedEdge {
    return {
      id: edge.id,
      sources: [
        useDedicatedPorts && edge.source === edge.target
          ? getPortId(edge.source, edge.id, 'out')
          : edge.source,
      ],
      targets: [
        useDedicatedPorts ? getPortId(edge.target, edge.id, 'in') : edge.target,
      ],
      labels:
        includeLabels && edge.label
          ? [{ text: edge.label, ...edge.labelSize }]
          : undefined,
      layoutOptions: edge.initial
        ? { 'elk.layered.priority.direction': '20' }
        : undefined,
    };
  }

  function buildPorts(nodeId: string): ElkPort[] | undefined {
    if (!useDedicatedPorts) return undefined;

    const ports: ElkPort[] = [];

    for (const edge of connectedEdges.get(nodeId) ?? []) {
      const selfLoop = edge.source === edge.target;

      if (selfLoop && edge.source === nodeId) {
        ports.push({
          id: getPortId(nodeId, edge.id, 'out'),
          width: 2,
          height: 2,
          layoutOptions: { 'elk.port.side': 'EAST' },
        });
      }

      if (edge.target === nodeId) {
        ports.push({
          id: getPortId(nodeId, edge.id, 'in'),
          width: 2,
          height: 2,
          layoutOptions: { 'elk.port.side': selfLoop ? 'EAST' : 'WEST' },
        });
      }
    }

    return ports;
  }

  function buildNode(node: DiagramNode): ElkNode {
    const children = childrenByParent.get(node.id) ?? [];
    const isIndicator = node.state === undefined;

    return {
      id: node.id,
      width: isIndicator ? INITIAL_INDICATOR_SIZE : STATE_WIDTH,
      height: isIndicator
        ? INITIAL_INDICATOR_SIZE
        : node.state?.description
          ? STATE_HEIGHT
          : COLLAPSED_STATE_HEIGHT,
      children:
        children.length > 0
          ? children.map((child) => buildNode(child))
          : undefined,
      edges: edgesByContainer.get(node.id)?.map((edge) => buildEdge(edge)),
      ports: buildPorts(node.id),
      layoutOptions: {
        'elk.portConstraints': 'FIXED_SIDE',
        ...(children.length > 0
          ? {
              'elk.padding': `[top=${CONTAINER_HEADER_HEIGHT + CONTAINER_HEADER_GAP},left=${CONTAINER_PADDING},bottom=${CONTAINER_PADDING},right=${CONTAINER_PADDING}]`,
              'elk.spacing.nodeNode': '30',
            }
          : {}),
      },
    };
  }

  return {
    nodesById,
    edgesById,
    graph: {
      id: machine.id,
      children: (childrenByParent.get(undefined) ?? []).map((node) =>
        buildNode(node),
      ),
      edges: edgesByContainer.get(undefined)?.map((edge) => buildEdge(edge)),
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.spacing.nodeNode': '36',
        'elk.spacing.edgeEdge': '12',
        'elk.spacing.edgeNode': '18',
        'elk.spacing.nodeSelfLoop': '22',
        'elk.spacing.componentComponent': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '44',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.nodePlacement.favorStraightEdges': 'true',
        'elk.layered.edgeLabels.inline': 'true',
        'elk.layered.edgeLabels.sideSelection': 'SMART_DOWN',
        'elk.layered.unnecessaryBendpoints': 'true',
        ...(options.aspectRatio === undefined
          ? {}
          : { 'elk.aspectRatio': String(options.aspectRatio) }),
        ...(options.wrappingStrategy === undefined
          ? {}
          : {
              'elk.layered.wrapping.strategy': options.wrappingStrategy,
            }),
      },
    },
  };
}

function getEdgeSections(
  edge: ElkExtendedEdge,
  originX: number,
  originY: number,
): StateMachineSceneEdgeSection[] {
  const sections = (edge.sections ?? []).map((section) => ({
    points: [
      {
        x: section.startPoint.x + originX,
        y: section.startPoint.y + originY,
      },
      ...(section.bendPoints ?? []).map((point) => ({
        x: point.x + originX,
        y: point.y + originY,
      })),
      {
        x: section.endPoint.x + originX,
        y: section.endPoint.y + originY,
      },
    ],
    target:
      section.outgoingShape !== undefined &&
      edge.targets.includes(section.outgoingShape),
  }));

  if (sections.length > 0 && !sections.some((section) => section.target)) {
    return sections.map((section, index) =>
      index === sections.length - 1 ? { ...section, target: true } : section,
    );
  }

  return sections;
}

function polylineLength(points: readonly ElkPoint[]): number {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
  }

  return length;
}

function pointAtDistance(
  points: readonly ElkPoint[],
  distance: number,
): ElkPoint | undefined {
  let remaining = distance;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);

    if (remaining <= length) {
      const progress = length === 0 ? 0 : remaining / length;

      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    }

    remaining -= length;
  }

  return points.at(-1);
}

function projectOntoEdge(
  points: readonly ElkPoint[],
  point: ElkPoint,
): ElkPoint {
  let closest = point;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const progress =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
                lengthSquared,
            ),
          );
    const candidate = {
      x: start.x + progress * deltaX,
      y: start.y + progress * deltaY,
    };
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);

    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}

function projectOntoSections(
  sections: readonly StateMachineSceneEdgeSection[],
  point: ElkPoint,
): ElkPoint | undefined {
  let closest: ElkPoint | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const section of sections) {
    const candidate = projectOntoEdge(section.points, point);
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);

    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}

function getSectionsMidpoint(
  sections: readonly StateMachineSceneEdgeSection[],
): ElkPoint | undefined {
  const lengths = sections.map((section) => polylineLength(section.points));
  let distance = lengths.reduce((sum, length) => sum + length, 0) / 2;

  for (let index = 0; index < sections.length; index += 1) {
    if (distance <= lengths[index]) {
      return pointAtDistance(sections[index].points, distance);
    }

    distance -= lengths[index];
  }

  return sections.at(-1)?.points.at(-1);
}

function createSceneEdge(
  edge: ElkExtendedEdge,
  diagramEdge: DiagramEdge,
  originX: number,
  originY: number,
): StateMachineSceneEdge {
  const label = edge.labels?.[0];
  const sections = getEdgeSections(edge, originX, originY);
  const elkLabelCenter =
    label?.x === undefined ||
    label.y === undefined ||
    label.width === undefined ||
    label.height === undefined
      ? undefined
      : {
          x: label.x + label.width / 2 + originX,
          y: label.y + label.height / 2 + originY,
        };
  const embeddedLabelCenter = elkLabelCenter
    ? projectOntoSections(sections, elkLabelCenter)
    : getSectionsMidpoint(sections);

  return {
    id: edge.id,
    source: diagramEdge.source,
    target: diagramEdge.target,
    sections,
    initial: diagramEdge.initial,
    label: diagramEdge.label || undefined,
    labelWidth: diagramEdge.labelSize.width,
    labelHeight: diagramEdge.labelSize.height,
    labelX: embeddedLabelCenter?.x,
    labelY: embeddedLabelCenter?.y,
  };
}

export function containsPoint(
  node: StateMachineSceneNode,
  point: StateMachinePoint,
  tolerance = TARGET_TOLERANCE,
): boolean {
  return (
    point.x >= node.x - tolerance &&
    point.x <= node.x + node.width + tolerance &&
    point.y >= node.y - tolerance &&
    point.y <= node.y + node.height + tolerance
  );
}

function repairDetachedTargets(
  edges: readonly StateMachineSceneEdge[],
  nodes: readonly StateMachineSceneNode[],
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return edges.map((edge) => {
    const target = nodesById.get(edge.target);
    const targetSectionIndex = edge.sections.findIndex(
      (section) => section.target,
    );
    const targetSection = edge.sections[targetSectionIndex];
    const endpoint = targetSection?.points.at(-1);
    if (!target || !targetSection || !endpoint) return edge;
    if (containsPoint(target, endpoint)) return edge;

    const prefix = targetSection.points.slice(
      0,
      Math.min(3, targetSection.points.length - 1),
    );
    const routeStart = prefix.at(-1) ?? targetSection.points[0];
    const targetY = target.y + target.height / 2;
    const targetLaneX = target.x - 20;
    const repairedSection = {
      ...targetSection,
      points: [
        ...prefix,
        { x: targetLaneX, y: routeStart.y },
        { x: targetLaneX, y: targetY },
        { x: target.x, y: targetY },
      ],
    };
    const sections = edge.sections.map((section, index) =>
      index === targetSectionIndex ? repairedSection : section,
    );
    const projectedLabel =
      edge.labelX === undefined || edge.labelY === undefined
        ? undefined
        : projectOntoSections(sections, {
            x: edge.labelX,
            y: edge.labelY,
          });

    return {
      ...edge,
      sections,
      labelX: projectedLabel?.x,
      labelY: projectedLabel?.y,
    };
  });
}

/** Positions a serialized state machine with ELK's compound layered layout. */
export async function layoutStateMachine(
  machine: SerializedStateMachine,
  options: StateMachineLayoutOptions = {},
): Promise<StateMachineLayout> {
  if (options.aspectRatio !== undefined && options.aspectRatio <= 0) {
    throw new RangeError(
      'State machine aspect ratio must be greater than zero.',
    );
  }

  const { graph, nodesById, edgesById } = toElkGraph(machine, options);
  const elk = await getElk();
  const result = await elk.layout(graph);
  const nodes: StateMachineSceneNode[] = [];
  const edges: StateMachineSceneEdge[] = [];

  function collect(
    container: ElkNode,
    parentId: string | undefined,
    originX: number,
    originY: number,
  ): void {
    for (const edge of container.edges ?? []) {
      const diagramEdge = edgesById.get(edge.id);
      if (diagramEdge) {
        edges.push(createSceneEdge(edge, diagramEdge, originX, originY));
      }
    }

    for (const child of container.children ?? []) {
      const diagramNode = nodesById.get(child.id);
      if (!diagramNode) continue;

      const state = diagramNode.state;
      const box = {
        id: child.id,
        parentId,
        x: originX + (child.x ?? 0),
        y: originY + (child.y ?? 0),
        width: child.width ?? STATE_WIDTH,
        height: child.height ?? STATE_HEIGHT,
      };

      nodes.push(
        state
          ? {
              ...box,
              kind: 'state',
              label: state.label,
              description: state.description,
              type: state.type,
              initial: state.initial,
              container: (child.children?.length ?? 0) > 0,
            }
          : { ...box, kind: 'initial' },
      );

      collect(child, child.id, box.x, box.y);
    }
  }

  collect(result, undefined, 0, 0);
  return {
    width: result.width ?? 0,
    height: result.height ?? 0,
    nodes,
    edges: repairDetachedTargets(edges, nodes),
  };
}
