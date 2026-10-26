import type {
  ActorDefinition,
  Entry,
  Instance,
  Snapshot,
} from '@kestack/kabuki';

/*
 * The app at one Step, read from its Snapshot and the definitions alone:
 *
 * 1. Walk     every Instance with the definition it runs, and its path.
 * 2. Workers  which run: each Worker's Condition asked of the Instance's
 *             data, the same question the Runtime asks.
 * 3. Change   what one Step changed: the two Snapshots walked side by side,
 *             skipping every branch that is the same object.
 * 4. Tell     a Step as plain sentences.
 */

/** One Instance and the definition it runs. */
export interface LiveNode {
  readonly instance: Instance;
  readonly definition: ActorDefinition;
  /** The slot names that lead to it from the root, as the Blueprint's paths are. */
  readonly path: string;
  /** Its slot name; null for the root. */
  readonly slot: string | null;
  readonly children: ReadonlyArray<LiveNode>;
}

const join = (path: string, slot: string) =>
  path === '' ? slot : `${path}/${slot}`;

const instancesIn = (
  held: Instance | ReadonlyArray<Instance> | undefined,
): ReadonlyArray<Instance> =>
  held === undefined ? [] : Array.isArray(held) ? held : [held as Instance];

// 1. Walk
export const walk = (
  instance: Instance,
  definition: ActorDefinition,
  path = '',
  slot: string | null = null,
): LiveNode => {
  const slots = definition.children[instance.state._tag] ?? {};
  return {
    instance,
    definition,
    path,
    slot,
    children: Object.entries(instance.children).flatMap(([name, held]) => {
      const child = slots[name]?.definition;
      return child
        ? instancesIn(held).map((one) =>
            walk(one, child, join(path, name), name),
          )
        : [];
    }),
  };
};

/** Every node of a tree, the root first. */
export const nodesOf = (node: LiveNode): ReadonlyArray<LiveNode> => [
  node,
  ...node.children.flatMap(nodesOf),
];

// 2. Workers
export interface WorkerNow {
  readonly name: string;
  /** The keys it runs for now; `''` alone for one that is not `each`. */
  readonly keys: ReadonlyArray<string>;
}

export const workersOf = (
  instance: Instance,
  definition: ActorDefinition,
): ReadonlyArray<WorkerNow> => {
  const data = {
    model: instance.model,
    state: instance.state,
    props: instance.props,
  };
  return Object.entries(definition.workers).map(([name, worker]) => {
    try {
      return { name, keys: worker.keys(data) };
    } catch {
      return { name, keys: [] };
    }
  });
};

const running = (instance: Instance, definition: ActorDefinition) =>
  new Set(
    workersOf(instance, definition).flatMap(({ name, keys }) =>
      keys.map((key) => (key === '' ? name : `${name}#${key}`)),
    ),
  );

// 3. Change
export interface Change {
  readonly kind: 'added' | 'removed' | 'changed';
  readonly actor: string;
  readonly state?: readonly [from: string, to: string];
  /** The paths in its Model that changed, `·` for the whole of it. */
  readonly model: ReadonlyArray<string>;
  /** Each Model path that changed, with its value before and after. */
  readonly values: ReadonlyArray<Value>;
  readonly props: ReadonlyArray<string>;
  /** Each Props path that changed, with its value before and after. */
  readonly propValues: ReadonlyArray<Value>;
  /** Its Model and Props as they were before the Step, for a changed Instance. */
  readonly was?: { readonly model: unknown; readonly props: unknown };
  readonly started: ReadonlyArray<string>;
  readonly stopped: ReadonlyArray<string>;
}

export interface Value {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
}

/** The value at a path `pathsChanged` names. */
const at = (value: unknown, path: string): unknown =>
  path === '·'
    ? value
    : path
        .split('.')
        .reduce<unknown>(
          (inner, key) => (isObject(inner) ? inner[key] : undefined),
          value,
        );

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** The paths at which two values differ, as far down as 4 levels. */
export const pathsChanged = (
  before: unknown,
  after: unknown,
  path = '',
  depth = 0,
): ReadonlyArray<string> => {
  if (Object.is(before, after)) return [];
  if (depth < 4 && isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      pathsChanged(
        before[key],
        after[key],
        join(path, key).replaceAll('/', '.'),
        depth + 1,
      ),
    );
  }
  return [path === '' ? '·' : path];
};

const changesIn = (
  before: Instance | undefined,
  after: Instance | undefined,
  definition: ActorDefinition,
  out: Map<string, Change>,
) => {
  if (before === after) return;
  if (!before || !after) {
    const there = (after ?? before)!;
    const workers = [...running(there, definition)];
    out.set(there.id, {
      kind: after ? 'added' : 'removed',
      actor: definition.name,
      model: [],
      values: [],
      props: [],
      propValues: [],
      started: after ? workers : [],
      stopped: after ? [] : workers,
    });
  } else {
    const was = running(before, definition);
    const is = running(after, definition);
    const change: Change = {
      kind: 'changed',
      actor: definition.name,
      was: { model: before.model, props: before.props },
      ...(before.state._tag !== after.state._tag
        ? { state: [before.state._tag, after.state._tag] as const }
        : {}),
      ...(() => {
        const model = pathsChanged(before.model, after.model);
        return {
          model,
          values: model.map((path) => ({
            path,
            from: at(before.model, path),
            to: at(after.model, path),
          })),
        };
      })(),
      ...(() => {
        const props = pathsChanged(before.props, after.props);
        return {
          props,
          propValues: props.map((path) => ({
            path,
            from: at(before.props, path),
            to: at(after.props, path),
          })),
        };
      })(),
      started: [...is].filter((worker) => !was.has(worker)),
      stopped: [...was].filter((worker) => !is.has(worker)),
    };
    if (
      change.state ||
      change.model.length +
        change.props.length +
        change.started.length +
        change.stopped.length >
        0 ||
      before.state !== after.state
    )
      out.set(after.id, change);
  }
  const slots = {
    ...(before ? definition.children[before.state._tag] : {}),
    ...(after ? definition.children[after.state._tag] : {}),
  };
  for (const [name, slot] of Object.entries(slots)) {
    const was = instancesIn(before?.children[name]);
    const is = instancesIn(after?.children[name]);
    const ids = new Set([...was, ...is].map(({ id }) => id));
    for (const id of ids)
      changesIn(
        was.find((one) => one.id === id),
        is.find((one) => one.id === id),
        slot.definition,
        out,
      );
  }
};

/** What changed from one Snapshot to the next, by Instance id. */
export const changesOf = (
  before: Snapshot | undefined,
  after: Snapshot,
  root: ActorDefinition,
): ReadonlyMap<string, Change> => {
  const out = new Map<string, Change>();
  changesIn(before, after, root, out);
  return out;
};

// 4. Tell
const short = (id: string) => id.split('/').at(-1) ?? id;

const sourceOf = (entry: Entry): string => {
  const { source } = entry;
  switch (source.kind) {
    case 'view':
      return `view of ${short(source.instance)}`;
    case 'command':
      return `${source.name} of ${short(source.instance)}`;
    case 'worker':
      return `${source.name}${source.key ? `#${source.key}` : ''} of ${short(source.instance)}`;
    case 'provide':
      return `provide of ${short(source.instance)}`;
    case 'outside':
      return source.name ?? 'outside';
    case 'restore':
      return 'restore';
  }
};

/** A Step in short lines: what was sent, to whom, by what, then each Actor it changed. */
export const tell = (
  entry: Entry,
  changes: ReadonlyMap<string, Change>,
  outcome: 'handled' | 'ignored' | 'dropped',
): ReadonlyArray<string> => {
  const lines = [
    `${entry.message._tag.split('/').at(-1)} → ${short(entry.destination)} · from ${sourceOf(entry)}`,
  ];
  if (changes.size === 0)
    lines.push(
      outcome === 'handled'
        ? 'no change'
        : outcome === 'ignored'
          ? 'ignored'
          : 'dropped',
    );
  for (const change of changes.values()) {
    if (change.kind !== 'changed') {
      lines.push(
        `${change.actor}: ${change.kind === 'added' ? 'invoked' : 'stopped'}`,
      );
      continue;
    }
    const parts = [
      change.state && `${change.state[0]} → ${change.state[1]}`,
      change.model.length > 0 && `model ${change.model.join(', ')}`,
      change.props.length > 0 && `props ${change.props.join(', ')}`,
      ...change.started.map((worker) => `+ ${worker}`),
      ...change.stopped.map((worker) => `− ${worker}`),
    ].filter(Boolean);
    if (parts.length > 0) lines.push(`${change.actor}: ${parts.join(' · ')}`);
  }
  return lines;
};
