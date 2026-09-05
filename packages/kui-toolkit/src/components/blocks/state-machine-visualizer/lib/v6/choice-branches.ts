import { serializeMachine } from 'xstate-v6';
import type { AnyStateMachine } from 'xstate-v6';

import type { ChoiceBranch, DirectedGraphNodeLike } from '../serialize-graph';

interface ChoiceBranchJson {
  readonly target: string | readonly string[];
  readonly when?: { readonly type?: string };
  readonly description?: string;
}

interface StateNodeJson {
  readonly choice?: readonly ChoiceBranchJson[] | Record<string, unknown>;
  readonly states?: Record<string, StateNodeJson>;
}

function branchLabel(branch: ChoiceBranchJson, isLast: boolean): string {
  if (branch.description) return branch.description;
  if (branch.when?.type) return branch.when.type;
  return isLast ? 'otherwise' : '';
}

function resolveTarget(
  target: string,
  siblings: ReadonlyMap<string, string>,
): string | undefined {
  return target.startsWith('#') ? target.slice(1) : siblings.get(target);
}

function toBranches(
  choice: readonly ChoiceBranchJson[],
  siblings: ReadonlyMap<string, string>,
): ChoiceBranch[] {
  return choice.flatMap((branch, index) => {
    const targets: readonly string[] = Array.isArray(branch.target)
      ? branch.target
      : [branch.target as string];
    const label = branchLabel(branch, index === choice.length - 1);

    return targets.flatMap((target) => {
      const id = resolveTarget(target, siblings);
      return id ? [{ target: id, label }] : [];
    });
  });
}

function collect(
  graphNode: DirectedGraphNodeLike,
  jsonNode: StateNodeJson | undefined,
  siblings: ReadonlyMap<string, string>,
  branches: Map<string, readonly ChoiceBranch[]>,
): void {
  const choice = jsonNode?.choice;

  if (graphNode.stateNode.type === 'choice' && Array.isArray(choice)) {
    const resolved = toBranches(choice, siblings);
    if (resolved.length > 0) branches.set(graphNode.id, resolved);
  }

  const childSiblings = new Map(
    graphNode.children.map((child) => [child.stateNode.key, child.id]),
  );

  for (const child of graphNode.children) {
    collect(
      child,
      jsonNode?.states?.[child.stateNode.key],
      childSiblings,
      branches,
    );
  }
}

/**
 * Recovers the targets of `choice` state nodes, which `toDirectedGraph` never
 * emits edges for. Only the declarative `choice: [...]` form survives into the
 * machine's JSON definition; a `choice` function keeps its targets in a closure
 * and yields no branches.
 */
export function getChoiceBranches(
  graph: DirectedGraphNodeLike,
  machine: AnyStateMachine,
): ReadonlyMap<string, readonly ChoiceBranch[]> {
  const branches = new Map<string, readonly ChoiceBranch[]>();

  collect(
    graph,
    serializeMachine(machine) as StateNodeJson,
    new Map(),
    branches,
  );

  return branches;
}
