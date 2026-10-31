import type { ActorDefinition } from '@kestack/kabuki/core/actor';
import { schemaShape } from './schema.ts';
import type { Shape } from './schema.ts';

/*
 * The Blueprint: what an Actor is, read from its definition alone, so it is
 * the same every time and needs nothing running. Everything here is what
 * `build` keeps: its States, the Capabilities it requires, whether a
 * level provides any, the Messages each level has a rule for, its Workers
 * and when they run, its Children and when they exist, and the Queries it
 * answers, each with what it is asked with and answers. What it cannot
 * say: what a `provides` gives, what a Condition tests, a Model's fields.
 * Those are functions or Schemas `build` does not keep.
 */

/** When a Worker or Child exists, inside the level it is written in. */
export type Condition = 'always' | 'while' | 'each';

export interface WorkerPrint {
  readonly name: string;
  readonly condition: Condition;
}

export interface SlotPrint {
  readonly name: string;
  readonly actor: ActorDefinition;
  readonly condition: Condition;
  /** Made again, a fresh Instance, when its key changes. */
  readonly keyed: boolean;
}

/** One Query a level answers: what it is asked with, if anything, and what it answers. */
export interface QueryPrint {
  readonly name: string;
  readonly args?: Shape;
  readonly result: Shape;
}

/** One level: the top, for as long as the Instance lives, or one State's block. */
export interface Level {
  /** The Messages it has a rule for. */
  readonly on: ReadonlyArray<string>;
  readonly workers: ReadonlyArray<WorkerPrint>;
  readonly children: ReadonlyArray<SlotPrint>;
  readonly queries: ReadonlyArray<QueryPrint>;
  /** Whether it provides Capabilities to everything below it. */
  readonly provides: boolean;
}

export interface Blueprint {
  readonly name: string;
  /** Its State tags; `Single` alone for an Actor without States. */
  readonly states: ReadonlyArray<string>;
  readonly single: boolean;
  /** The Capabilities its own code may use, by name. */
  readonly requires: ReadonlyArray<string>;
  readonly top: Level;
  readonly state: Readonly<Record<string, Level>>;
}

/** A Capability's name: the last part of its key. */
export const nameOf = (key: unknown): string => {
  const id = String((key as { readonly key?: unknown }).key ?? key);
  return id.split(/[/:]/).at(-1) ?? id;
};

const conditionOf = (kind: string): Condition =>
  kind === 'each' ? 'each' : kind === 'while' ? 'while' : 'always';

const prints = new WeakMap<ActorDefinition, Blueprint>();

export const blueprintOf = (definition: ActorDefinition): Blueprint => {
  const kept = prints.get(definition);
  if (kept) return kept;
  const workersIn = (state: string | undefined) =>
    Object.entries(definition.workers)
      .filter(([, worker]) => worker.state === state)
      .map(([name, worker]) => ({ name, condition: conditionOf(worker.kind) }));
  const queriesIn = (state: string | undefined): ReadonlyArray<QueryPrint> =>
    Object.entries(definition.queries)
      .filter(([, query]) => query.state === state)
      .map(([name]) => {
        const schemas = definition.schemas.queries?.[name];
        const args = schemaShape(schemas?.args);
        return {
          name,
          ...(args ? { args } : {}),
          result: schemaShape(schemas?.result) ?? { kind: 'leaf', text: '?' },
        };
      });
  const slotsIn = (state: string, names: (name: string) => boolean) =>
    Object.entries(definition.children[state] ?? {})
      .filter(([name]) => names(name))
      .map(([name, slot]) => ({
        name,
        actor: slot.definition,
        condition: conditionOf(slot.kind),
        keyed: slot.keyed,
      }));
  const lasting = new Set(definition.lasting);
  const first = definition.states[0] ?? 'Single';
  const print: Blueprint = {
    name: definition.name,
    states: definition.states,
    single: definition.states.length === 1 && first === 'Single',
    requires: [...new Set(definition.requires.map(nameOf))],
    top: {
      on: Object.keys(definition.update['*'] ?? {}),
      workers: workersIn(undefined),
      children: slotsIn(first, (name) => lasting.has(name)),
      queries: queriesIn(undefined),
      provides: definition.provides !== undefined,
    },
    state: Object.fromEntries(
      definition.states.map((tag) => [
        tag,
        {
          on: Object.keys(definition.update[tag] ?? {}),
          workers: workersIn(tag),
          children: slotsIn(tag, (name) => !lasting.has(name)),
          queries: queriesIn(tag),
          provides: definition.stateProvides[tag] !== undefined,
        },
      ]),
    ),
  };
  prints.set(definition, print);
  return print;
};

/** One Actor in the Blueprint's tree, by the path of slot names that leads to it. */
export interface PrintNode {
  /** `''` for the root, else its slots joined by `/`. */
  readonly path: string;
  readonly slot: SlotPrint | null;
  /** The State of its parent it exists in, or null at the parent's top. */
  readonly in: string | null;
  readonly definition: ActorDefinition;
  readonly print: Blueprint;
  readonly children: ReadonlyArray<PrintNode>;
}

/** The whole tree an Actor can grow, each Actor once per branch, so a cycle stops. */
export const treeOf = (
  definition: ActorDefinition,
  path = '',
  slot: SlotPrint | null = null,
  within: string | null = null,
  above: ReadonlySet<ActorDefinition> = new Set(),
): PrintNode => {
  const print = blueprintOf(definition);
  const seen = new Set(above).add(definition);
  const grow = (child: SlotPrint, state: string | null) =>
    seen.has(child.actor)
      ? []
      : [
          treeOf(
            child.actor,
            path === '' ? child.name : `${path}/${child.name}`,
            child,
            state,
            seen,
          ),
        ];
  return {
    path,
    slot,
    in: within,
    definition,
    print,
    children: [
      ...print.top.children.flatMap((child) => grow(child, null)),
      ...print.states.flatMap((tag) =>
        print.state[tag]!.children.flatMap((child) => grow(child, tag)),
      ),
    ],
  };
};

/** The node at a path, if the tree has one. */
export const nodeAt = (
  root: PrintNode,
  path: string,
): PrintNode | undefined => {
  if (path === '') return root;
  let node: PrintNode | undefined = root;
  let walked = '';
  for (const part of path.split('/')) {
    walked = walked === '' ? part : `${walked}/${part}`;
    node = node?.children.find((child) => child.path === walked);
  }
  return node;
};
