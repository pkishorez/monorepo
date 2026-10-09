import type {
  AnyNode,
  Definition,
  Only,
  Tagged,
  Types,
} from '../node/index.ts';

/*
 * The tree of Instances, with nothing but data: no Services, no Effects.
 * The live Runtime and Replay both grow the same tree; the Runtime adds the
 * outside world through Hooks.
 *
 * 1. Create   an Instance runs init and enters its State.
 * 2. Enter    a State creates its Children; leaving one destroys them.
 * 3. Handle   a Message and its Time go through Update; a new State is a
 *             Transition.
 * 4. Destroy  an Instance leaves its State and is gone.
 */

// What the outside sees ------------------------------------------------------

/** What a View is handed for one Instance, narrowed by its current State. */
export type Snapshot<N> = {
  [T in Types<N>['state']['_tag']]: {
    readonly model: Types<N>['model'];
    readonly state: Only<Types<N>['state'], T>;
    readonly children: {
      readonly [K in keyof KidsIn<N, T>]: Handle<KidsIn<N, T>[K]>;
    };
    readonly send: (message: Types<N>['message']) => void;
  };
}[Types<N>['state']['_tag']];

type KidsIn<N, T> = T extends keyof Types<N>['children']
  ? Types<N>['children'][T]
  : {};

/** One Instance in the tree, to watch or to draw. */
export interface Handle<N> {
  readonly path: string;
  readonly subscribe: (listener: () => void) => () => void;
  readonly current: () => Snapshot<N>;
}

/** One line of the Log: which Instance got which Message, and what came of it. */
export type Entry = Sent & {
  readonly path: string;
} & Outcome;

/**
 * A Message, the Instance it was sent to and its Time: all Replay needs.
 * Instances are numbered in the order they were created, which replaying
 * repeats exactly.
 */
export type Sent = {
  readonly id: number;
  readonly message: Tagged;
  /** When it was sent, in milliseconds since the Runtime started. */
  readonly at: number;
};

/** What handling one Message did. */
export type Outcome = {
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  readonly from: string;
  readonly to: string;
};

// What runs inside ------------------------------------------------------------

/** One running Node at one Path. */
export interface Instance {
  readonly id: number;
  readonly node: Definition;
  readonly path: string;
  readonly parent: Instance | undefined;
  readonly tree: Tree;
  alive: boolean;
  model: unknown;
  state: Tagged;
  children: Readonly<Record<string, Instance>>;
  snapshot: {
    readonly model: unknown;
    readonly state: Tagged;
    readonly children: Readonly<Record<string, Instance>>;
    readonly send: (message: Tagged) => void;
  };
  readonly listeners: Set<() => void>;
  readonly send: (message: Tagged) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly current: () => Instance['snapshot'];
}

/** What every Instance of one tree shares. */
interface Tree {
  readonly hooks: Hooks;
  /** How many Instances this tree has created so far. */
  created: number;
}

/** What a tree's owner does when something happens in it. */
export interface Hooks {
  /** Where an Instance's Messages go. */
  readonly send: (instance: Instance, message: Tagged) => void;
  /** A new Instance, before it enters its State. */
  readonly created?: (instance: Instance) => void;
  /** The Instance entered its State; its Children are not created yet. */
  readonly entered?: (instance: Instance) => void;
  /** The Instance is leaving its State; its Children are still there. */
  readonly leaving?: (instance: Instance) => void;
  /** The Instance stayed in its State with new data. */
  readonly changed?: (instance: Instance) => void;
  /** init or Update returned Commands; `replace` stops the ones still running first. */
  readonly commands?: (
    instance: Instance,
    commands: ReadonlyArray<unknown>,
    replace?: boolean,
  ) => void;
  /** The Instance is gone. */
  readonly destroyed?: (instance: Instance) => void;
}

// 1. Create --------------------------------------------------------------------

/** A new tree: the root Instance, and every Child its State has. */
export const plant = (node: AnyNode, hooks: Hooks): Instance =>
  create(node.definition, node.name, { hooks, created: 0 });

const create = (
  node: Definition,
  path: string,
  tree: Tree,
  parent?: Instance,
): Instance => {
  const { hooks } = tree;
  const init = node.init();
  const listeners = new Set<() => void>();
  const instance: Instance = {
    id: tree.created++,
    node,
    path,
    parent,
    tree,
    alive: true,
    model: init.model ?? {},
    state: init.state ?? { _tag: 'Single' },
    children: {},
    snapshot: undefined!,
    listeners,
    send: (message) => hooks.send(instance, message),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => instance.snapshot,
  };
  hooks.created?.(instance);
  enter(instance);
  instance.snapshot = snapshotOf(instance);
  if (init.commands?.length) hooks.commands?.(instance, init.commands);
  return instance;
};

// 2. Enter and leave a State ----------------------------------------------------

const enter = (instance: Instance): void => {
  instance.tree.hooks.entered?.(instance);
  const children = instance.node.children[instance.state._tag] ?? {};
  instance.children = Object.fromEntries(
    Object.entries(children).map(([name, child]) => [
      name,
      create(
        child.definition,
        `${instance.path}/${name}`,
        instance.tree,
        instance,
      ),
    ]),
  );
};

const leave = (instance: Instance): void => {
  instance.tree.hooks.leaving?.(instance);
  for (const child of Object.values(instance.children)) destroy(child);
  instance.children = {};
};

// 3. Handle a Message -------------------------------------------------------------

export const handle = (
  instance: Instance,
  message: Tagged,
  at: number,
): Outcome => {
  const from = instance.state._tag;
  if (!instance.alive) return { outcome: 'dropped', from, to: from };

  const { update } = instance.node;
  const rule = update[from]?.[message._tag] ?? update['*']?.[message._tag];
  if (!rule) return { outcome: 'ignored', from, to: from };

  const next = rule(message, {
    model: instance.model,
    state: instance.state,
    at,
  });
  apply(instance, next.model ?? instance.model, next.state ?? instance.state);
  if (next.commands?.length || next.replaceCommands)
    instance.tree.hooks.commands?.(
      instance,
      next.commands ?? [],
      next.replaceCommands,
    );
  return { outcome: 'handled', from, to: instance.state._tag };
};

const apply = (instance: Instance, model: unknown, state: Tagged): void => {
  if (model === instance.model && state === instance.state) return;
  const transition = state._tag !== instance.state._tag;

  if (transition) leave(instance);
  instance.model = model;
  instance.state = state;
  if (transition) enter(instance);
  else instance.tree.hooks.changed?.(instance);

  instance.snapshot = snapshotOf(instance);
  for (const listener of instance.listeners) listener();
};

// 4. Destroy ----------------------------------------------------------------------

/** The Instance leaves the tree. Its last snapshot stays readable. */
export const destroy = (instance: Instance): void => {
  instance.alive = false;
  leave(instance);
  instance.tree.hooks.destroyed?.(instance);
};

const snapshotOf = (instance: Instance): Instance['snapshot'] => ({
  model: instance.model,
  state: instance.state,
  children: instance.children,
  send: instance.send,
});
