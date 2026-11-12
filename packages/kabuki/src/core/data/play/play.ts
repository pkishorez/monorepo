import { Array as Arr } from 'effect';
import type { Tagged } from '../../actor/index.ts';
import type { ActorDefinition } from '../../actor/engine/index.ts';
import { keyOf } from './path.ts';
import type { Address } from './path.ts';
import { enter, follow } from './invoke.ts';
import { checkRestore, clamp, isRestore } from './restore.ts';
import type { Restore } from './restore.ts';
import type { Entry, From, Instance, Snapshot } from './init.ts';
import { pathTo, replace } from './tree.ts';
import type { Step } from './tree.ts';

/*
 * Play: a History entry and the Snapshot before it give the Snapshot after
 * it. Pure, and the only thing that changes data.
 *
 * 1. Find     the Instance the entry is for. One that is gone drops it.
 * 2. Check    the Message against its Actor's Schema: one that does not
 *             match throws before anything changes.
 * 3. Update   runs the rule for its State and the Message, with its Model,
 *             State and Props. No rule ignores it.
 *             The fields of the Model it gives go over the Model's own, and
 *             the Model and any new State are checked against the Actor's
 *             Schemas, as is what it Emits: one that does not match throws
 *             before anything changes.
 * 4. Apply    the new data, marked as changed by the entry: a new State is a
 *             Transition and Invokes the State's Children fresh; the same
 *             State lets keyed Children follow the Model. Either way every
 *             Child is handed its Props again.
 * 5. Replace  the Instance in the tree. Every Instance off its path stays
 *             the same object.
 * 6. Emit     what the Update Emits becomes the parent's Message, as the
 *             Child's slot turns it, for the Runtime to Send next. One the
 *             slot does not turn, or the root's, is not heard.
 *
 * A Restore skips all of them: it puts a whole saved tree in place.
 */

/** What playing one entry did. Never kept in the History: playing it again says the same. */
export interface Played {
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  /** The Snapshot right after the entry. */
  readonly snapshot: Snapshot;
  /** The Commands the Update asked for, to run in the Instance it was for. */
  readonly commands: ReadonlyArray<unknown>;
  /** The parent's Messages what the Update Emitted became, to Send next. */
  readonly emitted: ReadonlyArray<Emitted>;
}

/** One thing a Child Emitted, as the Message to its parent it became. */
export interface Emitted {
  /** The parent. */
  readonly to: Address;
  readonly message: Tagged;
  /** The Child that Emitted it, and the tag of what it Emitted. */
  readonly from: Extract<From, { readonly kind: 'emit' }>;
}

const nothing = (
  root: Instance,
  entry: Entry,
  outcome: 'ignored' | 'dropped',
): Played => ({
  outcome,
  snapshot: { entry: entry.id, root },
  commands: [],
  emitted: [],
});

export const play = (
  definition: ActorDefinition,
  { root }: Snapshot,
  entry: Entry,
): Played => {
  const { to, message, at } = entry;
  if (isRestore(message)) return restored(definition, root, entry, message);
  // 1. Find
  const path = pathTo(definition, root, to);
  if (!path) return nothing(root, entry, 'dropped');
  const { instance, definition: actor } = path.at(-1)!;
  const from = instance.state._tag;

  // 2. Check
  actor.check.message(message, `Message ${JSON.stringify(message._tag)}`);

  // 3. Update
  const rule = (actor.update[from]?.[message._tag] ??
    actor.update['*']?.[message._tag]) as
    | ((message: unknown, scope: unknown) => Next)
    | undefined;
  if (!rule) return nothing(root, entry, 'ignored');
  const next = rule(message, {
    model: instance.model,
    state: instance.state,
    props: instance.props,
    at,
  });

  const by = `the Update for ${JSON.stringify(message._tag)} in ${from} gave ${to}`;
  const model = merged(instance.model, next.model);
  if (model !== instance.model) actor.check.model(model, `the Model ${by}`);
  if (next.state !== undefined && next.state !== instance.state)
    actor.check.state(next.state, `the State ${by}`);
  const emits = next.emit === undefined ? [] : Arr.ensure(next.emit);
  for (const event of emits)
    actor.check.emits(
      event,
      `what the Update for ${JSON.stringify(message._tag)} Emitted from ${to}`,
    );

  // 4. Apply
  const state = next.state ?? instance.state;
  const changed = model !== instance.model || state !== instance.state;
  const marked = { ...instance, model, state, changed: entry.id };
  const after = !changed
    ? instance
    : state._tag !== from
      ? enter(actor, marked, entry.id)
      : follow(actor, marked, entry.id);

  // 5. Replace
  return {
    outcome: 'handled',
    snapshot: {
      entry: entry.id,
      root: after === instance ? root : replace(path, after),
    },
    commands: next.command === undefined ? [] : Arr.ensure(next.command),
    // 6. Emit
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
  const key = keyOf(child.instance.address) ?? '';
  return emits.flatMap((event) => {
    const turn = slot?.emits[event._tag];
    return turn
      ? [
          {
            to: parent.instance.address,
            message: turn(event, key),
            from: {
              kind: 'emit' as const,
              instance: child.instance.address,
              name: event._tag,
            },
          },
        ]
      : [];
  });
};

const warned = new WeakSet<object>();

const restored = (
  definition: ActorDefinition,
  root: Instance,
  entry: Entry,
  message: Restore,
): Played => {
  if (entry.to !== definition.name) return nothing(root, entry, 'dropped');
  const checked = checkRestore(definition, message);
  if ('reason' in checked) {
    if (!warned.has(message)) {
      warned.add(message);
      console.warn(
        `[@kestack/kabuki] a Restore no longer matches ${definition.name}, and is ignored: ${checked.reason}`,
      );
    }
    return nothing(root, entry, 'ignored');
  }
  return {
    outcome: 'handled',
    snapshot: { entry: entry.id, root: clamp(checked.root, entry.id) },
    commands: [],
    emitted: [],
  };
};

type Next = {
  readonly model?: unknown;
  readonly state?: Tagged;
  readonly command?: unknown;
  readonly emit?: Tagged | ReadonlyArray<Tagged>;
};
