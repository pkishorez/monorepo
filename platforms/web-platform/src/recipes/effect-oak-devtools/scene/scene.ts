import type { ActorDefinition, Snapshot } from 'effect-oak';
import { beatsOf } from './beats.ts';
import type { Beats, Said } from './beats.ts';
import { layout } from './layout/index.ts';
import type { Box, Branch, Kind } from './layout/index.ts';
import type { ActorNode, Item } from './nodes.ts';
import { treeOf } from './tree.ts';
import type { Statuses } from './tree.ts';

/*
 * A Scene: everything the Map draws for one Step, placed. Pure.
 *
 * 1. Tree    the Nodes, from the Actors and the Step's Snapshot.
 * 2. Layout  a packed tree or an outline. Under a card, one small node per
 *            State that starts something: the State it is in holds what it
 *            starts; any other only names it, faded. What runs in every
 *            State hangs straight from the card. So a Transition moves the
 *            Map, and so does a fold: a folded card hides what hangs below
 *            it and names it, under itself.
 * 3. Light   a Node is lit while an Instance runs there; a line while both
 *            its ends are.
 * 4. Beats   what the Step's Message did, if it has one.
 */

export type Placed = ActorNode &
  Box & {
    readonly lit: boolean;
    /** Folded: what hangs right below it, by name, and how many places hide below in all. */
    readonly folded?: {
      readonly names: ReadonlyArray<string>;
      readonly hidden: number;
    };
  };

/** The room a folded card's names take under it. */
export const FOLD = 30;

/** A State node: one State of a card that starts something. */
export interface PlacedState extends Box {
  readonly id: string;
  /** The card it belongs to. */
  readonly owner: string;
  readonly tag: string;
  /** The card's Instance is in it, so what it starts runs. */
  readonly active: boolean;
  readonly lit: boolean;
  /** Not the one it is in: what it would start, by name, under it. */
  readonly names?: ReadonlyArray<string>;
}

/** A State node's height, and its room for names when it is not the one. */
export const STATE = { height: 26, names: 22 } as const;

const stateWidth = (tag: string) => Math.max(72, 34 + tag.length * 7);

/** The ID of a card's State node. */
export const stateId = (owner: string, tag: string) => `${owner}~${tag}`;

/** The State a card's shown Instance is in. */
const currentOf = (node: ActorNode) =>
  (node.many ? node.chosen : node.instances[0])?.state._tag;

export interface Scene {
  readonly nodes: ReadonlyArray<Placed>;
  readonly lines: ReadonlyArray<{
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly d: string;
    readonly lit: boolean;
  }>;
  readonly labels: ReadonlyArray<{
    readonly id: string;
    readonly owner: string;
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly align: 'middle' | 'start';
    readonly lit: boolean;
  }>;
  /** The State nodes. */
  readonly states: ReadonlyArray<PlacedState>;
  readonly beats: Beats | undefined;
  /** Where every Node sits, by ID. */
  readonly at: ReadonlyMap<string, Placed>;
  /** The live app's Workers are laid over it. */
  readonly live: boolean;
}

export interface Shown {
  readonly definition: ActorDefinition;
  readonly snapshot: Snapshot;
  /** The Step's Message; none for init. */
  readonly said?: Said;
  /** What the live app says of each Instance's Workers; none away from it. */
  readonly statuses?: Statuses;
  readonly layout?: Kind;
  /** The Instance chosen at each place of many, by the place's ID. */
  readonly chosen?: ReadonlyMap<string, string>;
  /** The cards folded, by ID. */
  readonly folded?: ReadonlySet<string>;
}

const NOT_LIVE: Statuses = () => undefined;

const branchOf = (
  { node, children }: Item,
  folded: ReadonlySet<string>,
): Branch => {
  if (folded.has(node.id) && children.length)
    return {
      id: node.id,
      width: node.width,
      height: node.height + FOLD,
      children: [],
    };
  const current = currentOf(node);
  // Children by the State that starts them, in the order the States are written.
  const byState = new Map<string, Item[]>();
  for (const { via, item } of children)
    if (via) byState.set(via, [...(byState.get(via) ?? []), item]);
  const states = [...byState].map(([tag, items]): { branch: Branch } => ({
    branch:
      tag === current
        ? {
            id: stateId(node.id, tag),
            width: stateWidth(tag),
            height: STATE.height,
            children: items.map((item) => ({ branch: branchOf(item, folded) })),
          }
        : {
            id: stateId(node.id, tag),
            width: stateWidth(tag),
            height: STATE.height + STATE.names,
            children: [],
          },
  }));
  return {
    id: node.id,
    width: node.width,
    height: node.height,
    children: [
      ...states,
      ...children
        .filter(({ via }) => !via)
        .map(({ item }) => ({ branch: branchOf(item, folded) })),
    ],
  };
};

/** How many places hang below an Item, at any depth. */
const countBelow = (item: Item): number =>
  item.children.reduce(
    (sum, { item: child }) => sum + 1 + countBelow(child),
    0,
  );

export const sceneOf = ({
  definition,
  snapshot,
  said,
  statuses,
  layout: kind = 'tree',
  chosen,
  folded = new Set(),
}: Shown): Scene => {
  // 1. Tree
  const toward = said
    ? [
        said.envelope.destination,
        ...('instance' in said.envelope.source
          ? [said.envelope.source.instance]
          : []),
      ]
    : [];
  const { tree, find } = treeOf(
    definition,
    snapshot,
    statuses ?? NOT_LIVE,
    chosen,
    toward,
  );
  const nodes = new Map<string, ActorNode>();
  const items = new Map<string, Item>();
  const parents = new Map<string, string>();
  const collect = (item: Item) => {
    nodes.set(item.node.id, item.node);
    items.set(item.node.id, item);
    for (const { item: child } of item.children) {
      parents.set(child.node.id, item.node.id);
      collect(child);
    }
  };
  collect(tree);

  // 2. Layout
  const laid = layout(branchOf(tree, folded), kind);

  // 3. Light
  const states: PlacedState[] = [];
  for (const [id, box] of laid.boxes) {
    if (nodes.has(id)) continue;
    const owner = box.parent!;
    const node = nodes.get(owner)!;
    const tag = id.slice(owner.length + 1);
    const active = currentOf(node) === tag;
    states.push({
      ...box,
      id,
      owner,
      tag,
      active,
      lit: active && node.instances.length > 0,
      ...(active
        ? {}
        : {
            height: STATE.height,
            names: items
              .get(owner)!
              .children.filter(({ via }) => via === tag)
              .map(({ item }) => item.node.name),
          }),
    });
  }
  const placed: Placed[] = [...laid.boxes].flatMap(([id, box]) => {
    if (!nodes.has(id)) return [];
    const node = nodes.get(id)!;
    const item = items.get(id)!;
    const fold =
      folded.has(id) && item.children.length
        ? {
            folded: {
              names: item.children.map(({ item: child }) => child.node.name),
              hidden: countBelow(item),
            },
            height: box.height - FOLD,
          }
        : {};
    return [{ ...node, ...box, lit: node.instances.length > 0, ...fold }];
  });
  const at = new Map(placed.map((node) => [node.id, node]));
  const stateAt = new Map(states.map((state) => [state.id, state]));
  const lit = (id: string) => (at.get(id) ?? stateAt.get(id))!.lit;

  return {
    nodes: placed,
    states,
    lines: laid.lines.map((line) => ({
      id: line.id,
      from: line.from,
      to: line.to,
      d: line.d,
      lit: lit(line.from) && lit(line.to),
    })),
    labels: [],
    // 4. Beats
    // A Message into a folded card's subtree beats at the folded card.
    beats:
      said &&
      beatsOf(said, (id) => {
        let place = find(id);
        while (place && !at.has(place)) place = parents.get(place);
        return place;
      }),
    at,
    live: statuses !== undefined,
  };
};
