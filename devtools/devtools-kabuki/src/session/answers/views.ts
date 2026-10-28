import { handle } from '@kestack/kabuki';
import type {
  ActorDefinition,
  Entry,
  History,
  Instance,
  Snapshot,
} from '@kestack/kabuki';
import type * as Api from '../../api/index.ts';
import type { Blueprint } from './read/blueprint.ts';
import { unified } from './read/diff.ts';
import { encoded, encodedEntries } from './read/encode.ts';
import type { GraphNode } from './read/graph.ts';
import { casesOf, schemaShape } from './read/schema.ts';
import type { Field } from './read/schema.ts';
import {
  changesOf,
  nodesOf,
  pathsChanged,
  valueAt,
  walk,
} from './read/steps.ts';
import type { Change, LiveNode } from './read/steps.ts';

/*
 * What `read` works out, as the Api says it: plain JSON, every value of
 * the app's own encoded by its Actor.
 *
 * 1. Entry   a History entry, its Message encoded.
 * 2. Change  what a Step did to each Instance, its values and diffs
 *            compared on the encoded side.
 * 3. Graph   the canvas's tree, each definition read into its Blueprint.
 * 4. Node    one Instance's card: its data, its change, its Schemas.
 */

// 1. Entry
export const entryOf = (history: History, entry: Entry): Api.Entry => {
  const saved = encodedEntries(history).get(entry.id) ?? entry;
  return {
    id: entry.id,
    parent: entry.parent,
    destination: entry.destination,
    message: saved.message,
    tag: entry.message._tag,
    source: entry.source,
    at: entry.at,
    outcome: history.outcome(entry.id),
  };
};

// 2. Change
/** Every Instance in a Snapshot with the definition it runs, by id. */
const byId = (
  snapshot: Snapshot | undefined,
  root: ActorDefinition,
): ReadonlyMap<string, LiveNode> =>
  new Map(
    snapshot
      ? nodesOf(walk(snapshot, root)).map((node) => [node.instance.id, node])
      : [],
  );

const valuesOf = (
  encode: (value: unknown) => unknown,
  before: unknown,
  after: unknown,
) => {
  const from = encoded(encode, before);
  const to = encoded(encode, after);
  return {
    values: pathsChanged(from, to).map((path) => {
      const was = valueAt(from, path);
      const is = valueAt(to, path);
      // JSON has no undefined: a side the path is not on is left out.
      return {
        path,
        ...(was === undefined ? {} : { from: was }),
        ...(is === undefined ? {} : { to: is }),
      };
    }),
    diff: unified(from, to),
  };
};

const changeOf = (
  id: string,
  change: Change,
  before: LiveNode | undefined,
  after: LiveNode | undefined,
): Api.InstanceChange => {
  const base = {
    instance: id,
    kind: change.kind,
    actor: change.actor,
    ...(change.state ? { state: change.state } : {}),
    started: change.started,
    stopped: change.stopped,
  };
  if (change.kind !== 'changed' || !before || !after)
    return { ...base, model: [], props: [] };
  const { encoding } = after.definition;
  const model = valuesOf(
    encoding.model.encode,
    before.instance.model,
    after.instance.model,
  );
  const props = valuesOf(
    encoding.props.encode,
    before.instance.props,
    after.instance.props,
  );
  return {
    ...base,
    model: model.values,
    props: props.values,
    diff: { model: model.diff, props: props.diff },
  };
};

/** What one entry did: the Commands its rule asked for, and each Instance it changed. */
export const changesAt = (
  history: History,
  entry: Entry,
): {
  readonly commands: ReadonlyArray<string>;
  readonly changes: ReadonlyArray<Api.InstanceChange>;
} => {
  const root = history.actor.definition;
  const before = history.snapshotAt(entry.parent);
  const after = history.snapshotAt(entry.id);
  const was = byId(before, root);
  const is = byId(after, root);
  return {
    // Its rules played again, as they are pure.
    commands: handle(root, before, entry).commands.map((command) =>
      String((command as { readonly name?: unknown }).name ?? 'command'),
    ),
    changes: [...changesOf(before, after, root)].map(([id, change]) =>
      changeOf(id, change, was.get(id), is.get(id)),
    ),
  };
};

// 3. Graph
const blueprintOf = (print: Blueprint): Api.GraphNode['blueprint'] => {
  const level = (one: Blueprint['top']) => ({
    on: one.on,
    workers: one.workers,
    children: one.children.map((slot) => ({
      name: slot.name,
      actor: slot.actor.name,
      condition: slot.condition,
      keyed: slot.keyed,
    })),
    queries: one.queries,
    provides: one.provides,
  });
  return {
    name: print.name,
    states: print.states,
    single: print.single,
    requires: print.requires,
    top: level(print.top),
    state: Object.fromEntries(
      Object.entries(print.state).map(([tag, one]) => [tag, level(one)]),
    ),
  };
};

export const graphOf = (node: GraphNode): Api.GraphNode => ({
  id: node.id,
  title: node.title,
  actor: node.print.name,
  blueprint: blueprintOf(node.print),
  condition: node.condition,
  keyed: node.keyed,
  within: node.within,
  state: node.state,
  ...(node.instance?.key === undefined ? {} : { key: node.instance.key }),
  workers: node.workers ?? [],
  ...(node.change
    ? {
        change: {
          kind: node.change.kind,
          ...(node.change.state ? { state: node.change.state } : {}),
          model: node.change.model,
          props: node.change.props,
          started: node.change.started,
          stopped: node.change.stopped,
        },
      }
    : {}),
  ...(node.known
    ? {
        known: {
          moves: node.known.moves,
          ran: Object.fromEntries(
            [...node.known.ran].map(([worker, states]) => [
              worker,
              [...states],
            ]),
          ),
          gives: node.known.gives,
        },
      }
    : {}),
  touched: (node.touched ?? []).map((touch) => ({
    entry: touch.entry,
    message: touch.message,
    own: touch.own,
    kind: touch.change.kind,
  })),
  gone: node.gone ?? [],
  ...(node.took ? { took: node.took } : {}),
  children: node.children.map(graphOf),
});

// 4. Node
const casesRecord = (
  cases: ReadonlyMap<string, ReadonlyArray<Field>>,
): Readonly<Record<string, ReadonlyArray<Field>>> => Object.fromEntries(cases);

/** The Instance's data at a Step, and what its Schemas say it holds. */
export const nodeOf = (
  instance: Instance,
  definition: ActorDefinition,
  workers: Api.GraphNode['workers'],
): Omit<Api.Node, 'at' | 'status' | 'provides' | 'change'> => {
  const { encoding, schemas } = definition;
  const model = schemaShape(schemas.model);
  const props = schemaShape(schemas.props);
  return {
    id: instance.id,
    actor: definition.name,
    ...(instance.key === undefined ? {} : { key: instance.key }),
    state: encoded(encoding.state.encode, instance.state),
    model: encoded(encoding.model.encode, instance.model),
    ...('props' in instance
      ? { props: encoded(encoding.props.encode, instance.props) }
      : {}),
    workers,
    schemas: {
      ...(model ? { model } : {}),
      ...(props ? { props } : {}),
      states: casesRecord(casesOf(schemas.state)),
      messages: casesRecord(casesOf(schemas.message)),
    },
  };
};
