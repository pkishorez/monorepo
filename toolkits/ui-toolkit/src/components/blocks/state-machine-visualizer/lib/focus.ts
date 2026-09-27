import type {
  StateMachineDiagram,
  StateMachineFocus,
  StateMachineHighlight,
  StateMachinePoint,
  StateMachineSceneNode,
  StateMachineStateValue,
} from '../types';

const FOCUSED: StateMachineHighlight = { kind: 'focused' };
const DIMMED: StateMachineHighlight = { kind: 'dimmed' };
const IDLE: StateMachineHighlight = { kind: 'idle' };
const CONNECTED: StateMachineHighlight = {
  kind: 'connected',
  direction: 'outgoing',
};
const NO_NODE_IDS: ReadonlySet<string> = new Set();

function getChildrenByParent(
  diagram: StateMachineDiagram,
): ReadonlyMap<string, readonly StateMachineSceneNode[]> {
  const children = new Map<string, StateMachineSceneNode[]>();

  for (const node of diagram.nodes) {
    if (node.parentId === undefined || node.kind !== 'state') continue;
    const siblings = children.get(node.parentId);
    if (siblings) siblings.push(node);
    else children.set(node.parentId, [node]);
  }

  return children;
}

export function createSelectionTargets(
  diagram: StateMachineDiagram,
): ReadonlyMap<string, StateMachineSceneNode> {
  const childrenByParent = getChildrenByParent(diagram);
  const targets = new Map<string, StateMachineSceneNode>();

  for (const node of diagram.nodes) {
    if (node.kind !== 'state') continue;
    if (!node.container) {
      targets.set(node.id, node);
      continue;
    }

    const visited = new Set<string>([node.id]);
    let generation: readonly StateMachineSceneNode[] =
      childrenByParent.get(node.id) ?? [];

    while (generation.length > 0) {
      const initial = generation.find((candidate) => candidate.initial);
      if (initial) {
        targets.set(node.id, initial);
        break;
      }

      const next: StateMachineSceneNode[] = [];
      for (const child of generation) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        next.push(...(childrenByParent.get(child.id) ?? []));
      }
      generation = next;
    }
  }

  return targets;
}

function getVisibleWrapperIds(
  diagram: StateMachineDiagram,
  focusedNodeIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const wrapperIds = new Set<string>();

  for (const focusedNodeId of focusedNodeIds) {
    let parentId = nodesById.get(focusedNodeId)?.parentId;
    const visited = new Set<string>();

    while (parentId !== undefined && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodesById.get(parentId);
      if (!parent) break;

      if (parent.type === 'compound' || parent.type === 'parallel') {
        wrapperIds.add(parent.id);
      }
      parentId = parent.parentId;
    }
  }

  return wrapperIds;
}

function getLeafPaths(
  value: StateMachineStateValue,
  parentPath: readonly string[] = [],
): readonly (readonly string[])[] {
  if (typeof value === 'string') return [[...parentPath, value]];

  const entries = Object.entries(value);
  if (entries.length === 0) return parentPath.length > 0 ? [parentPath] : [];

  return entries.flatMap(([key, child]) =>
    getLeafPaths(child, [...parentPath, key]),
  );
}

function pathKey(path: readonly string[]): string {
  return path.join('\u0000');
}

export function resolveActiveNodeIds(
  diagram: StateMachineDiagram,
  value: StateMachineStateValue,
): ReadonlySet<string> {
  const activePaths = new Set(getLeafPaths(value).map(pathKey));
  const activeNodeIds = new Set<string>();

  for (const node of diagram.nodes) {
    if (node.kind !== 'state' || node.path === undefined) continue;
    if (activePaths.has(pathKey(node.path))) activeNodeIds.add(node.id);
  }

  return activeNodeIds;
}

export function resolveFocus(
  diagram: StateMachineDiagram,
  focus: StateMachineFocus,
  selectedNodeId: string | undefined,
): {
  readonly focusedNodeIds: ReadonlySet<string>;
  readonly follow: boolean;
  readonly followedCenter?: StateMachinePoint;
} {
  if (focus.mode === 'active-state') {
    const focusedNodeIds = resolveActiveNodeIds(diagram, focus.value);
    const follow = focus.follow !== false;
    return {
      focusedNodeIds,
      follow,
      followedCenter: follow
        ? getFocusedCenter(diagram, focusedNodeIds)
        : undefined,
    };
  }

  if (focus.mode === 'highlight') {
    const focusedNodeIds = diagram.nodes.some(
      (node) => node.id === focus.nodeId,
    )
      ? new Set([focus.nodeId])
      : NO_NODE_IDS;
    const follow = focus.follow === true;
    return {
      focusedNodeIds,
      follow,
      followedCenter: follow
        ? getFocusedCenter(diagram, focusedNodeIds)
        : undefined,
    };
  }

  if (
    focus.mode === 'click' &&
    selectedNodeId !== undefined &&
    diagram.nodes.some((node) => node.id === selectedNodeId)
  ) {
    return { focusedNodeIds: new Set([selectedNodeId]), follow: false };
  }

  return { focusedNodeIds: NO_NODE_IDS, follow: false };
}

export function getFocusHighlights(
  diagram: StateMachineDiagram,
  focusedNodeIds: ReadonlySet<string>,
  hoveredConnectedNodeId?: string,
): {
  readonly nodes: ReadonlyMap<string, StateMachineHighlight>;
  readonly edges: ReadonlyMap<string, StateMachineHighlight>;
} {
  if (focusedNodeIds.size === 0) {
    return { nodes: new Map(), edges: new Map() };
  }

  const outgoingTargetIds = new Set<string>();
  for (const edge of diagram.edges) {
    if (focusedNodeIds.has(edge.source)) outgoingTargetIds.add(edge.target);
  }

  const hoveredConnection =
    hoveredConnectedNodeId !== undefined &&
    outgoingTargetIds.has(hoveredConnectedNodeId)
      ? hoveredConnectedNodeId
      : undefined;
  const visuallyFocusedNodeIds = new Set(focusedNodeIds);
  if (hoveredConnection !== undefined) {
    visuallyFocusedNodeIds.add(hoveredConnection);
  }
  const visibleWrapperIds = getVisibleWrapperIds(
    diagram,
    visuallyFocusedNodeIds,
  );

  const nodes = new Map<string, StateMachineHighlight>();
  for (const node of diagram.nodes) {
    if (focusedNodeIds.has(node.id)) {
      nodes.set(node.id, FOCUSED);
      continue;
    }
    if (visibleWrapperIds.has(node.id)) {
      nodes.set(node.id, IDLE);
      continue;
    }

    const outgoing =
      hoveredConnection === undefined
        ? outgoingTargetIds.has(node.id)
        : node.id === hoveredConnection;
    nodes.set(node.id, outgoing ? CONNECTED : DIMMED);
  }

  const edges = new Map<string, StateMachineHighlight>();
  for (const edge of diagram.edges) {
    const sourceFocused =
      focusedNodeIds.has(edge.source) &&
      (hoveredConnection === undefined || edge.target === hoveredConnection);
    edges.set(edge.id, sourceFocused ? CONNECTED : DIMMED);
  }

  return { nodes, edges };
}

export function getFocusedCenter(
  diagram: StateMachineDiagram,
  focusedNodeIds: ReadonlySet<string>,
): StateMachinePoint | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const node of diagram.nodes) {
    if (node.kind !== 'state' || !focusedNodeIds.has(node.id)) continue;
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }

  if (left === Number.POSITIVE_INFINITY) return undefined;

  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
