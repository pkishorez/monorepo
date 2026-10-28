import type { ActorDefinition, Instance } from '@kestack/kabuki';
import type { Blueprint, Condition, PrintNode } from './blueprint.ts';
import { blueprintOf } from './blueprint.ts';
import type { Change, LiveNode, WorkerNow } from './steps.ts';
import { workersOf } from './steps.ts';
import type { Known, Learned, Touch } from './learned.ts';

/*
 * The canvas's own tree: one node per Actor, running or only in the
 * Blueprint, as data: where each card goes is the Inspector's to say.
 */

export interface GraphNode {
  readonly id: string;
  /** Its slot in its parent; the Actor's name at the root. */
  readonly title: string;
  readonly print: Blueprint;
  /** The definition it is drawn from: its Schemas are read from it. */
  readonly definition: ActorDefinition;
  /** When it exists in its parent: null for the root. */
  readonly condition: Condition | null;
  readonly keyed: boolean;
  /** Its parent's State it lives in, when not the parent's top. */
  readonly within: string | null;
  /** The State it is in, or is shown in. */
  readonly state: string | null;
  readonly instance?: Instance;
  readonly workers?: ReadonlyArray<WorkerNow>;
  readonly change?: Change;
  /** What the app was seen to do with its Actor: moves, where Workers ran, what it gives. */
  readonly known?: Known;
  /** Every Step that changed this Instance. */
  readonly touched?: ReadonlyArray<Touch>;
  /** Its Children the Step stopped, by slot: no longer in the tree, so drawn only here. */
  readonly gone?: ReadonlyArray<{ readonly slot: string; readonly id: string }>;
  /** The Message the Step was for this Instance, and the Commands it asked for. */
  readonly took?: {
    readonly message: string;
    readonly commands: ReadonlyArray<string>;
    /** Whether a rule took it, none did, or its Instance was gone. */
    readonly outcome: 'handled' | 'ignored' | 'dropped';
  };
  readonly children: ReadonlyArray<GraphNode>;
}

/** What a Step was: the Instance its Message was for, and what that asked. */
export interface Took {
  readonly destination: string;
  readonly message: string;
  readonly commands: ReadonlyArray<string>;
  readonly outcome: 'handled' | 'ignored' | 'dropped';
}

/** A page's key is its params; one with none says nothing. */
const keyOf = (key: string | undefined) =>
  key && key !== '[]' && key !== '{}' ? ` #${key}` : '';

export const fromLive = (
  node: LiveNode,
  changes: ReadonlyMap<string, Change>,
  parent?: LiveNode,
  learned?: Learned,
  took?: Took,
): GraphNode => {
  const print = blueprintOf(node.definition);
  const slot =
    parent && node.slot
      ? [
          ...blueprintOf(parent.definition).top.children,
          ...(blueprintOf(parent.definition).state[parent.instance.state._tag]
            ?.children ?? []),
        ].find(({ name }) => name === node.slot)
      : undefined;
  const lasting = parent?.definition.lasting.includes(node.slot ?? '') ?? true;
  const change = changes.get(node.instance.id);
  return {
    id: node.instance.id,
    title: `${node.slot ?? print.name}${keyOf(node.instance.key)}`,
    print,
    definition: node.definition,
    condition: slot?.condition ?? null,
    keyed: slot?.keyed ?? false,
    within: lasting ? null : (parent?.instance.state._tag ?? null),
    state: node.instance.state._tag,
    instance: node.instance,
    workers: workersOf(node.instance, node.definition),
    ...(change ? { change } : {}),
    ...(learned
      ? {
          known: learned.of(node.definition),
          touched: learned.touched(node.instance.id),
        }
      : {}),
    ...(() => {
      // A Child's id is its parent's, then `/slot[key]#n`.
      const gone = [...changes]
        .filter(
          ([id, one]) =>
            one.kind === 'removed' &&
            id.slice(0, id.lastIndexOf('/')) === node.instance.id,
        )
        .map(([id]) => ({
          id,
          slot: id.slice(id.lastIndexOf('/') + 1).split(/[[#]/)[0]!,
        }));
      return gone.length > 0 ? { gone } : {};
    })(),
    ...(took?.destination === node.instance.id
      ? {
          took: {
            message: took.message,
            commands: took.commands,
            outcome: took.outcome,
          },
        }
      : {}),
    children: node.children.map((child) =>
      fromLive(child, changes, node, learned, took),
    ),
  };
};

export const fromPrint = (
  node: PrintNode,
  state: (path: string) => string | null,
  learned?: Learned,
): GraphNode => ({
  id: node.path === '' ? '/' : node.path,
  title: node.slot?.name ?? node.print.name,
  print: node.print,
  definition: node.definition,
  condition: node.slot?.condition ?? null,
  keyed: node.slot?.keyed ?? false,
  within: node.in,
  state: state(node.path),
  ...(learned ? { known: learned.of(node.definition) } : {}),
  children: node.children.map((child) => fromPrint(child, state, learned)),
});

/** Every node, the root first. */
export const allOf = (node: GraphNode): ReadonlyArray<GraphNode> => [
  node,
  ...node.children.flatMap(allOf),
];

/** The ids from the root down to `id`, both ends in; empty if it is not there. */
export const pathTo = (node: GraphNode, id: string): ReadonlyArray<string> => {
  if (node.id === id) return [id];
  for (const child of node.children) {
    const below = pathTo(child, id);
    if (below.length > 0) return [node.id, ...below];
  }
  return [];
};

/** The Capabilities an Instance provides now: at its top, and in the State it is in. */
const givesNow = (node: GraphNode): ReadonlyArray<string> => [
  ...(node.known?.gives.top ?? []),
  ...(node.state ? (node.known?.gives.state[node.state] ?? []) : []),
];

/**
 * The nearest card above `id` that provides the Capability `name` now:
 * the one its code gets it from. None when no Actor in the tree provides
 * it, and the app's Layer, above the root, hands it in.
 */
export const providerOf = (
  root: GraphNode,
  id: string,
  name: string,
): string | undefined => {
  const byId = new Map(allOf(root).map((node) => [node.id, node]));
  return pathTo(root, id)
    .slice(0, -1)
    .reverse()
    .find((one) => {
      const node = byId.get(one);
      return node !== undefined && givesNow(node).includes(name);
    });
};
