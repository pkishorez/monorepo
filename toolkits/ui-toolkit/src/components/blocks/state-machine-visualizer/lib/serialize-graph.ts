import type {
  SerializedStateMachine,
  SerializedStateMachineEdge,
  SerializedStateMachineNode,
  StateMachineNodeType,
} from '../types';

export interface DirectedGraphNodeLike {
  readonly id: string;
  readonly stateNode: {
    readonly key: string;
    readonly type: string;
    readonly description?: string;
    readonly parent?: {
      readonly initial: {
        readonly target?: readonly { readonly id: string }[] | undefined;
      };
    };
  };
  readonly edges: readonly DirectedGraphEdgeLike[];
  readonly children: readonly DirectedGraphNodeLike[];
}

export interface ChoiceBranch {
  readonly target: string;
  readonly label?: string;
}

export interface SerializeGraphOptions {
  readonly choiceBranches?: ReadonlyMap<string, readonly ChoiceBranch[]>;
  readonly delays?: ReadonlyMap<string, number>;
}

interface DirectedGraphEdgeLike {
  readonly id: string;
  readonly source: { readonly id: string };
  readonly target: { readonly id: string };
  readonly label: { readonly text: string };
}

const NODE_TYPES: readonly string[] = [
  'atomic',
  'compound',
  'parallel',
  'final',
  'history',
  'choice',
];

const SYNTHETIC_EVENT_LABELS: readonly (readonly [string, string])[] = [
  ['xstate.done.', 'Done'],
  ['xstate.error', 'Error'],
  ['xstate.timeout', 'Timeout'],
  ['xstate.route', 'Route'],
  ['xstate.init', 'Start'],
];

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60_000) {
    return `${Math.round(milliseconds / 100) / 10}s`;
  }
  return `${Math.round(milliseconds / 6000) / 10}m`;
}

function formatDelayedLabel(
  value: string,
  delays: ReadonlyMap<string, number>,
): string {
  const delay = value.split('.')[2];
  if (!delay) return 'After delay';

  const milliseconds = /^\d+$/.test(delay) ? Number(delay) : delays.get(delay);

  return milliseconds === undefined
    ? `After ${humanize(delay).toLowerCase()}`
    : `After ${formatDuration(milliseconds)}`;
}

function formatTransitionLabel(
  value: string,
  delays: ReadonlyMap<string, number>,
): string {
  if (value.startsWith('xstate.after'))
    return formatDelayedLabel(value, delays);

  const match = SYNTHETIC_EVENT_LABELS.find(([prefix]) =>
    value.startsWith(prefix),
  );
  return match ? match[1] : value;
}

function toNodeType(value: string): StateMachineNodeType {
  return NODE_TYPES.includes(value)
    ? (value as StateMachineNodeType)
    : 'atomic';
}

function isInitialNode(node: DirectedGraphNodeLike): boolean {
  const initialTargets = node.stateNode.parent?.initial.target ?? [];
  return initialTargets.some((target) => target.id === node.id);
}

function collectIds(node: DirectedGraphNodeLike, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.children) collectIds(child, ids);
}

export function serializeDirectedGraph(
  graph: DirectedGraphNodeLike,
  options: SerializeGraphOptions = {},
): SerializedStateMachine {
  const nodes: SerializedStateMachineNode[] = [];
  const edges: SerializedStateMachineEdge[] = [];
  const reachable = new Set<string>();
  const choiceBranches: ReadonlyMap<string, readonly ChoiceBranch[]> =
    options.choiceBranches ?? new Map();
  const delays: ReadonlyMap<string, number> = options.delays ?? new Map();

  for (const child of graph.children) collectIds(child, reachable);

  function serializeNode(
    graphNode: DirectedGraphNodeLike,
    parentId: string | undefined,
    parentPath: readonly string[],
  ): void {
    const path = [...parentPath, graphNode.stateNode.key];

    nodes.push({
      id: graphNode.id,
      path,
      label: humanize(graphNode.stateNode.key),
      description: graphNode.stateNode.description,
      type: toNodeType(graphNode.stateNode.type),
      parentId,
      initial: isInitialNode(graphNode),
    });

    for (const edge of graphNode.edges) {
      if (!reachable.has(edge.source.id) || !reachable.has(edge.target.id)) {
        continue;
      }
      edges.push({
        id: edge.id,
        source: edge.source.id,
        target: edge.target.id,
        label: formatTransitionLabel(edge.label.text, delays),
      });
    }

    (choiceBranches.get(graphNode.id) ?? []).forEach((branch, index) => {
      if (!reachable.has(branch.target)) return;
      edges.push({
        id: `${graphNode.id}:choice:${index}`,
        source: graphNode.id,
        target: branch.target,
        label: branch.label ?? '',
      });
    });

    for (const child of graphNode.children) {
      serializeNode(child, graphNode.id, path);
    }
  }

  for (const child of graph.children) serializeNode(child, undefined, []);

  return {
    id: graph.id,
    label: humanize(graph.stateNode.key),
    nodes,
    edges,
  };
}
