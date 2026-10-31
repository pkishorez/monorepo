import { Array as Arr } from 'effect';
import type { ActorDefinition, Tagged } from '../../actor/index.ts';
import { enter, follow } from './invoke.ts';
import { checkRestore, isRestore } from './restore.ts';
import type { Envelope, Instance, Snapshot } from './snapshot.ts';
import { pathTo, replace } from './tree.ts';
import type { Step } from './tree.ts';

/*
 * Handle: an Envelope and a Snapshot give the next Snapshot. Pure.
 *
 * 1. Find     the Instance the Envelope is for. One that is gone drops it.
 * 2. Update   runs the rule for its State and the Message, with its Model,
 *             State and Props. No rule ignores it.
 *             The fields of the Model it gives go over the Model's own, and
 *             the Model and any new State are checked against the Actor's
 *             Schemas, as is what it Emits: one that does not match throws
 *             before anything changes.
 * 3. Apply    the new data: a new State is a Transition and Invokes the
 *             State's Children fresh; the same State lets keyed Children
 *             follow the Model. Either way every Child is handed its Props
 *             again.
 * 4. Replace  the Instance in the Snapshot. Every Instance off its path stays
 *             the same object.
 * 5. Emit     what the Update Emits becomes the parent's Message, as the
 *             Child's slot turns it, for the Runtime to Send next. One the
 *             slot does not turn, or the root's, is not heard.
 *
 * A Restore skips all four: it puts a whole saved Snapshot in place.
 */

/** What handling one Envelope did. Never kept in the History: handling it again says the same. */
export interface Handled {
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  /** The State tag before and after; empty when dropped. */
  readonly from: string;
  readonly to: string;
  readonly snapshot: Snapshot;
  /** The Commands the Update asked for, to run in the Instance it was for. */
  readonly commands: ReadonlyArray<unknown>;
  /** The parent's Messages what the Update Emitted became, to Send next. */
  readonly emitted: ReadonlyArray<Emitted>;
}

/** One thing a Child Emitted, as the Message to its parent it became. */
export interface Emitted {
  /** The parent's ID. */
  readonly destination: string;
  readonly message: Tagged;
  /** The Child that Emitted it, and the tag of what it Emitted. */
  readonly instance: string;
  readonly name: string;
}

const nothing = (
  snapshot: Snapshot,
  outcome: 'ignored' | 'dropped',
  tag = '',
) =>
  ({
    outcome,
    from: tag,
    to: tag,
    snapshot,
    commands: [],
    emitted: [],
  }) as const;

export const handle = (
  root: ActorDefinition,
  snapshot: Snapshot,
  { destination: id, message, at }: Envelope,
): Handled => {
  if (isRestore(message)) return restored(root, snapshot, id, message);
  // 1. Find
  const path = pathTo(root, snapshot, id);
  if (!path) return nothing(snapshot, 'dropped');
  const { instance, definition } = path.at(-1)!;
  const from = instance.state._tag;

  // 2. Update
  const rule = (definition.update[from]?.[message._tag] ??
    definition.update['*']?.[message._tag]) as
    | ((message: unknown, scope: unknown) => Next)
    | undefined;
  if (!rule) return nothing(snapshot, 'ignored', from);
  const next = rule(message, {
    model: instance.model,
    state: instance.state,
    props: instance.props,
    at,
  });

  const by = `the Update for ${JSON.stringify(message._tag)} in ${from} gave ${id}`;
  const model = merged(instance.model, next.model);
  if (model !== instance.model)
    definition.check.model(model, `the Model ${by}`);
  if (next.state !== undefined && next.state !== instance.state)
    definition.check.state(next.state, `the State ${by}`);
  const emits = next.emit === undefined ? [] : Arr.ensure(next.emit);
  for (const event of emits)
    definition.check.emits(
      event,
      `what the Update for ${JSON.stringify(message._tag)} Emitted from ${id}`,
    );

  // 3. Apply
  const state = next.state ?? instance.state;
  const changed = model !== instance.model || state !== instance.state;
  const after = !changed
    ? instance
    : state._tag !== from
      ? enter(definition, { ...instance, model, state })
      : follow(definition, { ...instance, model, state });

  // 4. Replace
  return {
    outcome: 'handled',
    from,
    to: state._tag,
    snapshot: after === instance ? snapshot : replace(path, after),
    commands: next.command === undefined ? [] : Arr.ensure(next.command),
    // 5. Emit
    emitted: emittedOf(path, emits),
  };
};

/** The Model with the fields an Update gave over its own: the same object while none changes. */
const merged = (model: unknown, fields: unknown): unknown => {
  if (fields === undefined || fields === model) return model;
  const own = model as Readonly<Record<string, unknown>>;
  const given = fields as Readonly<Record<string, unknown>>;
  return Object.keys(given).some(
    (field) => !Object.is(own[field], given[field]),
  )
    ? { ...own, ...given }
    : model;
};

/** What the Child at the end of `path` Emitted, as its parent's Messages. */
const emittedOf = (
  path: ReadonlyArray<Step>,
  emits: ReadonlyArray<Tagged>,
): ReadonlyArray<Emitted> => {
  const child = path.at(-1)!;
  const parent = path.at(-2);
  if (!parent || emits.length === 0) return [];
  const slot =
    parent.definition.children[parent.instance.state._tag]?.[child.slot];
  return emits.flatMap((event) => {
    const turn = slot?.emits[event._tag];
    return turn
      ? [
          {
            destination: parent.instance.id,
            message: turn(event, child.instance.key ?? ''),
            instance: child.instance.id,
            name: event._tag,
          },
        ]
      : [];
  });
};

const warned = new WeakSet<object>();

const restored = (
  root: ActorDefinition,
  snapshot: Snapshot,
  id: string,
  message: Parameters<typeof checkRestore>[1],
): Handled => {
  const from = snapshot.state._tag;
  if (id !== snapshot.id) return nothing(snapshot, 'dropped');
  const checked = checkRestore(root, message);
  if ('reason' in checked) {
    if (!warned.has(message)) {
      warned.add(message);
      console.warn(
        `[@kestack/kabuki] a Restore no longer matches ${root.name}, and is ignored: ${checked.reason}`,
      );
    }
    return nothing(snapshot, 'ignored', from);
  }
  const after = checked.snapshot;
  return {
    outcome: 'handled',
    from,
    to: after.state._tag,
    snapshot: after,
    commands: [],
    emitted: [],
  };
};

type Next = {
  readonly model?: unknown;
  readonly state?: Instance['state'];
  readonly command?: unknown;
  readonly emit?: Tagged | ReadonlyArray<Tagged>;
};
