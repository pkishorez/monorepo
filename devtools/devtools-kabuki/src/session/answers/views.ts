import { Address, History, Snapshot } from '@kestack/kabuki';
import type { Blueprint } from '@kestack/kabuki';
import type {
  AnyActor,
  BlueprintLevel,
  Entry,
  Instance,
  WorkerStatus,
} from '@kestack/kabuki/types';
import type * as Api from '../../api/index.ts';
import { blueprintOf, nameOf, unknownOf } from './read/blueprint.ts';
import { unified } from './read/diff.ts';
import {
  blueprintAt,
  encoded,
  encodedData,
  encodedEntries,
  keyOf,
} from './read/encode.ts';
import { fieldsOf, schemaShape } from './read/schema.ts';
import {
  changesOf,
  movesOf,
  pathsChanged,
  playedOf,
  statesOf,
  valueAt,
  workersChanged,
} from './read/step.ts';
import type { Change } from './read/step.ts';

/*
 * What `read` works out, as the Api says it: plain JSON, every value of
 * the app's own encoded by its Actor's Schemas, as its Blueprint holds
 * them. Kabuki is read only through its public surface: the root's
 * Blueprint, the History, Snapshots and Trails, the Workers the data asks
 * for, and the Runtime's Workers.
 *
 * 1. Entry   a History entry, its Message encoded, and what came of it.
 * 2. Change  what a Step did to each Instance, its values and diffs
 *            compared on the encoded side.
 * 3. Graph   the canvas's tree at a Step, each Instance with its Blueprint.
 * 4. Node    one Instance's card: its data, its change, its Schemas.
 * 5. Trail   one Instance's story, each moment with its entry.
 */

/** What an Instance's Workers are doing now; absent where nothing runs or it is not known. */
export type Statuses = (address: string) => ReadonlyArray<WorkerStatus>;

// 1. Entry
export const entryOf = (
  actor: AnyActor,
  history: History,
  entry: Entry,
): Api.Entry => {
  const saved = encodedEntries(actor, history).get(entry.id) ?? entry;
  return {
    id: entry.id,
    parent: entry.parent,
    to: entry.to,
    message: saved.message,
    tag: entry.message._tag,
    from: entry.from,
    at: entry.at,
    outcome: playedOf(actor, history, entry).outcome,
  };
};

// 2. Change
const valuesOf = (
  schema: Parameters<typeof encoded>[0],
  before: unknown,
  after: unknown,
) => {
  const from = encoded(schema, before);
  const to = encoded(schema, after);
  return { from, to, paths: pathsChanged(from, to) };
};

/** The Model and Props paths a change changed, compared on the encoded side. */
const pathsOf = (print: Blueprint | undefined, change: Change) => {
  const { before, after } = change;
  if (change.kind !== 'changed' || !before || !after)
    return { model: undefined, props: undefined };
  return {
    model: valuesOf(print?.schemas.model, before.model, after.model),
    props: valuesOf(print?.schemas.props, before.props, after.props),
  };
};

const instanceChangeOf = (
  actor: AnyActor,
  [before, after]: readonly [Snapshot | undefined, Snapshot],
  address: string,
  change: Change,
): Api.InstanceChange => {
  const base = {
    instance: address,
    kind: change.kind,
    actor: (change.after ?? change.before)!.actor,
    ...statesOf(change.before, change.after),
    ...workersChanged(actor, before, after, address),
  };
  const { model, props } = pathsOf(
    blueprintAt(actor.blueprint, address),
    change,
  );
  if (!model || !props) return { ...base, model: [], props: [] };
  const each = ({ from, to, paths }: typeof model) =>
    paths.map((path) => {
      const was = valueAt(from, path);
      const is = valueAt(to, path);
      // JSON has no undefined: a side the path is not on is left out.
      return {
        path,
        ...(was === undefined ? {} : { from: was }),
        ...(is === undefined ? {} : { to: is }),
      };
    });
  return {
    ...base,
    model: each(model),
    props: each(props),
    diff: {
      model: unified(model.from, model.to),
      props: unified(props.from, props.to),
    },
  };
};

/** What one entry did: the Commands its Update asked for, and each Instance it started, changed or stopped. */
export const changesAt = (
  actor: AnyActor,
  history: History,
  entry: Entry,
): {
  readonly commands: ReadonlyArray<string>;
  readonly changes: ReadonlyArray<Api.InstanceChange>;
} => {
  const before = Snapshot.replay(actor, history, entry.parent);
  const after = Snapshot.replay(actor, history, entry.id);
  return {
    commands: playedOf(actor, history, entry).commands,
    changes: [...changesOf(before, after)].map(([address, change]) =>
      instanceChangeOf(actor, [before, after], address, change),
    ),
  };
};

// 3. Graph
/** A page's key is its params; one with none says nothing. */
const keyText = (key: string | undefined) =>
  key && key !== '[]' && key !== '{}' ? ` #${key}` : '';

/** Its Workers and the keys each runs for, as the Runtime says; none where that is not known. */
const workersOf = (
  print: Blueprint | undefined,
  instance: Instance,
  statuses: Statuses | undefined,
): ReadonlyArray<typeof Api.WorkerNow.Type> => {
  if (!print || !statuses) return [];
  const now = statuses(instance.address);
  return [
    ...print.top.workers,
    ...(print.state[instance.state._tag]?.workers ?? []),
  ].map(({ name }) => ({
    name,
    keys: now
      .filter((one) => one.name === name && one.status === 'running')
      .map((one) => one.key),
  }));
};

const childrenOf = (instance: Instance): ReadonlyArray<Instance> =>
  Object.values(instance.children).flatMap((held) =>
    Snapshot.isMany(held) ? held : [held],
  );

/** The app at the Step after `id` (`null`: init), as the canvas draws it. Throws for an entry not kept. */
export const graphAt = (
  actor: AnyActor,
  history: History,
  id: number | null,
  statuses?: Statuses,
): Api.GraphNode => {
  const root = actor.blueprint;
  // Found by its id, so an entry a Fork left behind is read too.
  const entry = id === null ? undefined : History.entry(history, id);
  const after = Snapshot.replay(actor, history, id);
  const before = entry
    ? Snapshot.replay(actor, history, entry.parent)
    : undefined;
  const changes = changesOf(before, after);
  const took = entry && { to: entry.to, ...playedOf(actor, history, entry) };
  const moves = movesOf(actor, history);
  // A Child gone is no longer in the tree: its parent's card names it.
  const gone = new Map<string, Array<{ slot: string; id: string }>>();
  for (const [address, change] of changes) {
    const parent = Address.parent(address as Address);
    if (change.kind !== 'removed' || parent === undefined) continue;
    const slot = Address.parse(address as Address).path.at(-1)!.slot;
    gone.set(parent, [...(gone.get(parent) ?? []), { slot, id: address }]);
  }

  const nodeOf = (
    instance: Instance,
    print: Blueprint | undefined,
    slot: {
      readonly name: string;
      readonly state: string | undefined;
      readonly child: BlueprintLevel['children'][string] | undefined;
    } | null,
  ): Api.GraphNode => {
    const { address } = instance;
    const key = keyOf(address);
    const change = changes.get(address);
    const paths = change ? pathsOf(print, change) : undefined;
    const known = moves.get(instance.actor);
    return {
      id: address,
      title: slot ? `${slot.name}${keyText(key)}` : instance.actor,
      actor: instance.actor,
      blueprint: print ? blueprintOf(print) : unknownOf(instance.actor),
      condition: slot?.child?.kind ?? null,
      keyed: slot?.child?.keyed ?? false,
      within: slot?.state ?? null,
      state: instance.state._tag,
      ...(key === undefined ? {} : { key }),
      workers: workersOf(print, instance, statuses),
      ...(change
        ? {
            change: {
              kind: change.kind,
              ...statesOf(change.before, change.after),
              model: paths?.model?.paths ?? [],
              props: paths?.props?.paths ?? [],
              ...workersChanged(actor, before, after, address),
            },
          }
        : {}),
      ...(known ? { known: { moves: known } } : {}),
      gone: gone.get(address) ?? [],
      ...(took?.to === address
        ? {
            took: {
              message: entry!.message._tag,
              commands: took.commands,
              outcome: took.outcome,
            },
          }
        : {}),
      children: childrenOf(instance).map((child) => {
        const segment = Address.parse(child.address).path.at(-1)!;
        const level: BlueprintLevel | undefined = segment.state
          ? print?.state[segment.state]
          : print?.top;
        const found = level?.children[segment.slot];
        return nodeOf(child, found?.blueprint, {
          name: segment.slot,
          state: segment.state,
          child: found,
        });
      }),
    };
  };
  return nodeOf(after.root, root, null);
};

// 4. Node
/** The fields a tagged case carries besides `_tag`. */
const carried = (schema: Parameters<typeof schemaShape>[0]) =>
  fieldsOf(schemaShape(schema)).filter(({ name }) => name !== '_tag');

/** The Instance's data at a Step, what its Schemas say it holds, and what it Provides. */
export const nodeOf = (
  instance: Instance,
  print: Blueprint | undefined,
): Omit<Api.Node, 'at' | 'workers' | 'status' | 'change'> => {
  const key = keyOf(instance.address);
  const model = schemaShape(print?.schemas.model);
  const props = schemaShape(print?.schemas.props);
  const levels = print ? [print.top, ...Object.values(print.state)] : [];
  return {
    id: instance.address,
    actor: instance.actor,
    ...(key === undefined ? {} : { key }),
    ...encodedData(instance, print),
    provides: {
      top: print?.top.provides.map(nameOf) ?? [],
      state: print?.state[instance.state._tag]?.provides.map(nameOf) ?? [],
    },
    schemas: {
      ...(model ? { model } : {}),
      ...(props ? { props } : {}),
      states: Object.fromEntries(
        Object.entries(print?.state ?? {}).map(([tag, level]) => [
          tag,
          carried(level.data),
        ]),
      ),
      messages: Object.fromEntries(
        levels.flatMap((level) =>
          Object.entries(level.on).map(([tag, schema]) => [
            tag,
            carried(schema),
          ]),
        ),
      ),
    },
  };
};

/** Its Workers at the Step, and what each is doing, as the Runtime says. */
export const workersAt = (
  instance: Instance,
  print: Blueprint | undefined,
  statuses: Statuses | undefined,
) => ({
  workers: workersOf(print, instance, statuses),
  status: statuses ? [...statuses(instance.address)] : [],
});

/** What the Step after `entry` did to one Instance, if anything. */
export const changeAt = (
  actor: AnyActor,
  history: History,
  entry: Entry,
  address: string,
): Api.InstanceChange | undefined => {
  const before = Snapshot.replay(actor, history, entry.parent);
  const after = Snapshot.replay(actor, history, entry.id);
  const change = changesOf(before, after).get(address);
  return change && instanceChangeOf(actor, [before, after], address, change);
};

// 5. Trail
/** One Instance's Trail along the Branch up to an entry, the Head by default, each moment with its entry. */
export const trailOf = (
  actor: AnyActor,
  history: History,
  address: Address,
  upTo: number | null = history.head,
): Api.Trail => {
  const print = blueprintAt(actor.blueprint, address);
  const moments = Snapshot.trail(actor, history, address, upTo);
  const name =
    print?.name ??
    moments.find((one) => one.after ?? one.before)?.after?.actor ??
    '';
  return {
    instance: address,
    actor: name,
    moments: moments.map(({ entry, kind, before, after }) => {
      const paths =
        kind === 'changed' && before && after
          ? pathsOf(print, { kind: 'changed', before, after })
          : undefined;
      return {
        entry: entry ? entryOf(actor, history, entry) : null,
        kind,
        ...statesOf(before, after),
        model: paths?.model?.paths ?? [],
        props: paths?.props?.paths ?? [],
      };
    }),
  };
};
