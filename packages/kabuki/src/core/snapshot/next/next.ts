import { Array as Arr } from 'effect';
import type { ActorDefinition, Tagged } from '../../actor/index.ts';
import { keyOf } from '../address/index.ts';
import type { Address } from '../address/index.ts';
import { pathTo, replace } from '../instance/index.ts';
import type { Instance, Snapshot, Step } from '../instance/index.ts';
import type { Entry, From } from './entry.ts';
import { enter, follow } from './invoke.ts';

/*
 * Next: one entry and the Snapshot before it give the Snapshot after it.
 * Pure, and the only thing that changes data.
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
 * 4. Apply    the new data: a new State is a Transition and Invokes the
 *             State's Children fresh; the same State lets keyed Children
 *             follow the Model. Either way every Child is handed its Props
 *             again.
 * 5. Replace  the Instance in the tree. Every Instance off its path stays
 *             the same object.
 * 6. Emit     what the Update Emits becomes the parent's Message, as the
 *             Child's slot turns it, for the Runtime to Send next. One the
 *             slot does not turn, or the root's, is not heard.
 */

/** What one entry did. Never kept: the same entry after the same Snapshot says the same. */
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
  snapshot: { root, at: entry.at },
  commands: [],
  emitted: [],
});

export const next = (
  definition: ActorDefinition,
  { root }: Snapshot,
  entry: Entry,
): Played => {
  const { to, message, at } = entry;
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
  const given = rule(message, {
    model: instance.model,
    state: instance.state,
    props: instance.props,
    at,
  });

  const by = `the Update for ${JSON.stringify(message._tag)} in ${from} gave ${to}`;
  const model = merged(instance.model, given.model);
  if (model !== instance.model) actor.check.model(model, `the Model ${by}`);
  if (given.state !== undefined && given.state !== instance.state)
    actor.check.state(given.state, `the State ${by}`);
  const emits = given.emit === undefined ? [] : Arr.ensure(given.emit);
  for (const event of emits)
    actor.check.emits(
      event,
      `what the Update for ${JSON.stringify(message._tag)} Emitted from ${to}`,
    );

  // 4. Apply
  const state = given.state ?? instance.state;
  const changed = model !== instance.model || state !== instance.state;
  const applied = { ...instance, _tag: state._tag, model, state };
  const after = !changed
    ? instance
    : state._tag !== from
      ? enter(actor, applied)
      : follow(actor, applied);

  // 5. Replace
  return {
    outcome: 'handled',
    snapshot: {
      root: after === instance ? root : replace(path, after),
      at,
    },
    commands: given.command === undefined ? [] : Arr.ensure(given.command),
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

type Next = {
  readonly model?: unknown;
  readonly state?: Tagged;
  readonly command?: unknown;
  readonly emit?: Tagged | ReadonlyArray<Tagged>;
};
