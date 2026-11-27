import { Equal } from 'effect';
import type { ActorDefinition, Tagged } from '../../actor/index.ts';
import type { Address } from '../address/index.ts';
import type { Instance } from './instance.ts';
import { isMany } from './walk.ts';
import { workersOf } from './wanted.ts';
import type { WantedWorker } from './wanted.ts';

/*
 * Compare: what changed from one Snapshot to another, per Address. Pure,
 * and worked out from the two Snapshots alone, so nothing has to keep it.
 *
 * 1. Skip     an Instance that is the same object in both: Next makes new
 *             objects only on the path it changed, so nothing under it did.
 * 2. Data     an Instance in both, at the same Address, says what differs:
 *             its State, each Model field by `Object.is`, as an Update's
 *             fields are merged, and each Props field by `Equal.equals`, as
 *             a Child is handed them. New data may ask for other Workers,
 *             so the ones wanted before and after are compared too.
 * 3. Children are matched by Address, slot by slot, skipping a slot that
 *             is the same object in both. One only before is removed, one
 *             only after is added, each with everything under it. An
 *             Instance Invoked again has a new Address, so it is removed
 *             and added.
 *
 * Each Instance comes before its Children, and a parent's removed Children
 * before the ones it holds after.
 */

/** A value before and after. */
export interface BeforeAfter<T = unknown> {
  readonly before: T;
  readonly after: T;
}

/** An Instance as a Change shows it whole: its data, and the Workers that data asks for. */
export interface Whole {
  readonly address: Address;
  /** Its Actor's name. */
  readonly actor: string;
  /** Its key, if it is held under one. */
  readonly key?: string;
  readonly state: Tagged;
  readonly model: unknown;
  readonly props?: unknown;
  readonly workers: ReadonlyArray<WantedWorker>;
}

/** What changed at one Address between two Snapshots. Plain data: every value as the Snapshots hold it. */
export type Change =
  /** An Instance only after, with its data after. */
  | ({ readonly _tag: 'Added' } & Whole)
  /** An Instance only before, with its data before. */
  | ({ readonly _tag: 'Removed' } & Whole)
  /** An Instance in both whose data, or the Workers it asks for, differ. */
  | {
      readonly _tag: 'Changed';
      readonly address: Address;
      readonly actor: string;
      readonly key?: string;
      /** Its State, when it differs; `transition` when its tag does. */
      readonly state?: BeforeAfter<Tagged> & { readonly transition: boolean };
      /** Each Model field that differs. */
      readonly model: Readonly<Record<string, BeforeAfter>>;
      /** Each Props field that differs. */
      readonly props: Readonly<Record<string, BeforeAfter>>;
      readonly workers: {
        readonly started: ReadonlyArray<WantedWorker>;
        readonly stopped: ReadonlyArray<WantedWorker>;
      };
    };

/** What changed from the tree `before` to the tree `after`, both of the root's Actor. */
export const changesOf = (
  root: ActorDefinition,
  before: Instance,
  after: Instance,
): ReadonlyArray<Change> => {
  const out: Array<Change> = [];
  compare(root, before, after, out);
  return out;
};

const compare = (
  definition: ActorDefinition,
  before: Instance,
  after: Instance,
  out: Array<Change>,
): void => {
  // 1. Skip
  if (before === after) return;

  // 2. Data
  const changed = dataOf(definition, before, after);
  if (changed) out.push(changed);

  // 3. Children
  if (before.children === after.children) return;
  for (const [slot, held] of Object.entries(before.children)) {
    const now = after.children[slot];
    if (now === held) continue;
    const kept = addresses(now);
    for (const child of listOf(held))
      if (!kept.has(child.address))
        whole('Removed', childOf(definition, before, slot), child, out);
  }
  for (const [slot, held] of Object.entries(after.children)) {
    const was = before.children[slot];
    if (was === held) continue;
    const child = childOf(definition, after, slot);
    const earlier = new Map(
      listOf(was).map((instance) => [instance.address, instance]),
    );
    for (const instance of listOf(held)) {
      const match = earlier.get(instance.address);
      if (match) compare(child, match, instance, out);
      else whole('Added', child, instance, out);
    }
  }
};

/** What differs in the data of one Instance, in both; none when nothing does. */
const dataOf = (
  definition: ActorDefinition,
  before: Instance,
  after: Instance,
): Change | undefined => {
  if (
    before.state === after.state &&
    before.model === after.model &&
    before.props === after.props
  )
    return undefined;
  const state = Equal.equals(before.state, after.state)
    ? undefined
    : {
        before: before.state,
        after: after.state,
        transition: before.state._tag !== after.state._tag,
      };
  const model = fieldsOf(before.model, after.model, Object.is);
  const props = fieldsOf(before.props, after.props, Equal.equals);
  const was = workersOf(definition, before);
  const now = workersOf(definition, after);
  const workers = { started: missing(now, was), stopped: missing(was, now) };
  if (
    !state &&
    Object.keys(model).length === 0 &&
    Object.keys(props).length === 0 &&
    workers.started.length === 0 &&
    workers.stopped.length === 0
  )
    return undefined;
  return {
    _tag: 'Changed',
    ...placeOf(after),
    ...(state ? { state } : {}),
    model,
    props,
    workers,
  };
};

/** An Instance added or removed, and every Instance under it, each whole. */
const whole = (
  _tag: 'Added' | 'Removed',
  definition: ActorDefinition,
  instance: Instance,
  out: Array<Change>,
): void => {
  const { state, model, props } = instance;
  out.push({
    _tag,
    ...placeOf(instance),
    state,
    model,
    ...(props === undefined ? {} : { props }),
    workers: workersOf(definition, instance),
  });
  for (const [slot, held] of Object.entries(instance.children)) {
    const child = childOf(definition, instance, slot);
    for (const one of listOf(held)) whole(_tag, child, one, out);
  }
};

/** Who an Instance is: its Address, its Actor's name and its key. */
const placeOf = ({ address, actor, key }: Instance) => ({
  address,
  actor,
  ...(key === undefined ? {} : { key }),
});

/** The Actor of a Child in this slot, as its parent's State writes it. */
const childOf = (
  definition: ActorDefinition,
  parent: Instance,
  slot: string,
): ActorDefinition => definition.children[parent.state._tag]![slot]!.definition;

/** The fields of two structs that differ, by `same`, before and after. */
const fieldsOf = (
  before: unknown,
  after: unknown,
  same: (a: unknown, b: unknown) => boolean,
): Readonly<Record<string, BeforeAfter>> => {
  if (before === after) return {};
  const was = (before ?? {}) as Readonly<Record<string, unknown>>;
  const now = (after ?? {}) as Readonly<Record<string, unknown>>;
  const fields: Record<string, BeforeAfter> = {};
  for (const field of new Set([...Object.keys(was), ...Object.keys(now)]))
    if (!same(was[field], now[field]))
      fields[field] = { before: was[field], after: now[field] };
  return fields;
};

/** The Workers in `these` that are not in `those`, by name and key. */
const missing = (
  these: ReadonlyArray<WantedWorker>,
  those: ReadonlyArray<WantedWorker>,
): ReadonlyArray<WantedWorker> =>
  these.filter(
    ({ name, key }) =>
      !those.some((other) => other.name === name && other.key === key),
  );

/** The Instances a slot holds, one or a list, or none. */
const listOf = (
  held: Instance | ReadonlyArray<Instance> | undefined,
): ReadonlyArray<Instance> =>
  held === undefined ? [] : isMany(held) ? held : [held];

const addresses = (
  held: Instance | ReadonlyArray<Instance> | undefined,
): ReadonlySet<string> => new Set(listOf(held).map(({ address }) => address));
