import type { Definition } from '../actor/index.ts';
import { enter, follow } from './invoke.ts';
import { slotToward, within } from './id.ts';
import { isMany } from './many.ts';
import { checkRestore, isRestore } from './restore.ts';
import type { Envelope, Instance, Snapshot } from './snapshot.ts';

/*
 * Handle: an Envelope and a Snapshot give the next Snapshot. Pure.
 *
 * 1. Find     the Instance the Envelope is for. One that is gone drops it.
 * 2. Update   runs the rule for its State and the Message. No rule ignores it.
 *             A new Model or State it gives is checked against the Actor's
 *             Schemas, and one that does not match throws before anything
 *             changes.
 * 3. Apply    the new data: a new State is a Transition and Invokes the
 *             State's Children fresh; the same State lets keyed Children
 *             follow the Model.
 * 4. Replace  the Instance in the Snapshot. Every Instance off its path stays
 *             the same object.
 */

/** What handling one Envelope did. */
export interface Handled {
  readonly outcome: 'handled' | 'ignored' | 'dropped';
  /** The State tag before and after; empty when dropped. */
  readonly from: string;
  readonly to: string;
  readonly snapshot: Snapshot;
  /** When handled: the Instance before and after, and its Actor. */
  readonly change?: {
    readonly before: Instance;
    readonly after: Instance;
    readonly definition: Definition;
    /** The Commands the Update asked for. */
    readonly commands: ReadonlyArray<unknown>;
  };
}

type Step = {
  readonly instance: Instance;
  readonly definition: Definition;
  readonly slot: string;
};

export const handle = (
  root: Definition,
  snapshot: Snapshot,
  { instance: id, message, at }: Envelope,
): Handled => {
  if (isRestore(message)) return restored(root, snapshot, id, message);
  // 1. Find
  const path = find(root, snapshot, id);
  if (!path) return { outcome: 'dropped', from: '', to: '', snapshot };
  const { instance, definition } = path.at(-1)!;
  const from = instance.state._tag;

  // 2. Update
  const rule = (definition.update[from]?.[message._tag] ??
    definition.update['*']?.[message._tag]) as
    | ((message: unknown, scope: unknown) => Next)
    | undefined;
  if (!rule) return { outcome: 'ignored', from, to: from, snapshot };
  const next = rule(message, {
    model: instance.model,
    state: instance.state,
    at,
  });

  const by = `the Update for ${JSON.stringify(message._tag)} in ${from} gave ${id}`;
  if (next.model !== undefined && next.model !== instance.model)
    definition.check.model(next.model, `the Model ${by}`);
  if (next.state !== undefined && next.state !== instance.state)
    definition.check.state(next.state, `the State ${by}`);

  // 3. Apply
  const model = next.model ?? instance.model;
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
    change: {
      before: instance,
      after,
      definition,
      commands:
        next.command === undefined
          ? []
          : Array.isArray(next.command)
            ? next.command
            : [next.command],
    },
  };
};

const warned = new WeakSet<object>();

const restored = (
  root: Definition,
  snapshot: Snapshot,
  id: string,
  message: Parameters<typeof checkRestore>[1],
): Handled => {
  const from = snapshot.state._tag;
  if (id !== snapshot.id)
    return { outcome: 'dropped', from: '', to: '', snapshot };
  const checked = checkRestore(root, message);
  if ('reason' in checked) {
    if (!warned.has(message)) {
      warned.add(message);
      console.warn(
        `[effect-oak] a Restore no longer matches ${root.name}, and is ignored: ${checked.reason}`,
      );
    }
    return { outcome: 'ignored', from, to: from, snapshot };
  }
  const after = checked.snapshot;
  return {
    outcome: 'handled',
    from,
    to: after.state._tag,
    snapshot: after,
    change: { before: snapshot, after, definition: root, commands: [] },
  };
};

type Next = {
  readonly model?: unknown;
  readonly state?: Instance['state'];
  readonly command?: unknown;
};

/** The Actor of the Instance with ID `id`, if it is in the Snapshot. */
export const actorAt = (
  root: Definition,
  snapshot: Snapshot,
  id: string,
): Definition | undefined => find(root, snapshot, id)?.at(-1)?.definition;

/** The Instances from the root down to `id`, with their Actors; none if it is gone. */
const find = (
  root: Definition,
  snapshot: Snapshot,
  id: string,
): ReadonlyArray<Step> | undefined => {
  const path: Array<Step> = [
    { instance: snapshot, definition: root, slot: '' },
  ];
  for (let step = path[0]!; step.instance.id !== id;) {
    const slot = slotToward(step.instance.id, id);
    if (slot === undefined) return undefined;
    const definition =
      step.definition.children[step.instance.state._tag]?.[slot]?.definition;
    const child = childToward(step.instance.children[slot], id);
    if (!definition || !child) return undefined;
    step = { instance: child, definition, slot };
    path.push(step);
  }
  return path;
};

const childToward = (
  held: Instance | ReadonlyArray<Instance> | undefined,
  id: string,
): Instance | undefined =>
  held === undefined
    ? undefined
    : isMany(held)
      ? held.find((child) => within(child.id, id))
      : within(held.id, id)
        ? held
        : undefined;

const replace = (path: ReadonlyArray<Step>, after: Instance): Snapshot => {
  let child = after;
  for (let index = path.length - 2; index >= 0; index--) {
    const { instance } = path[index]!;
    const { slot } = path[index + 1]!;
    const held = instance.children[slot]!;
    const id = child.id;
    const replaced = child;
    child = {
      ...instance,
      children: {
        ...instance.children,
        [slot]: isMany(held)
          ? held.map((kept) => (kept.id === id ? replaced : kept))
          : replaced,
      },
    };
  }
  return child;
};

/** The Instance with this ID, if it is in the Snapshot. */
export const instanceAt = (
  snapshot: Snapshot,
  id: string,
): Instance | undefined => {
  let instance: Instance | undefined = snapshot;
  while (instance && instance.id !== id) {
    const slot = slotToward(instance.id, id);
    instance =
      slot === undefined ? undefined : childToward(instance.children[slot], id);
  }
  return instance;
};
