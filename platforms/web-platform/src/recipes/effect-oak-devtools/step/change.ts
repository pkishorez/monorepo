import { isMany } from 'effect-oak';
import type { Definition, Instance, Snapshot } from 'effect-oak';
import type { Around } from './step.ts';

/*
 * A Step's Change, worked out from the Snapshots right before and after it:
 * one Row per Instance, in tree order, saying whether the Step started or
 * stopped it, moved its State, which fields of its Model or State took a new
 * value, and which of its Workers it started or stopped. Fields are compared
 * down to plain values, lists by position; equal contents are no change.
 * Workers follow from the Snapshot alone: each Worker's Condition names the
 * keys it expects for the Instance's data, and the Change is their diff.
 * Pure, and remembered per pair of Snapshots.
 */

/** One field of a Model or State that took a new value. */
export interface Field {
  /** Whether it lives in the Model, or in the data of the State. */
  readonly in: 'model' | 'state';
  /** Where it is, from the top: `['items', 2, 'done']`; empty for the whole value. */
  readonly path: ReadonlyArray<string | number>;
  readonly kind: 'changed' | 'added' | 'removed';
  readonly before: unknown;
  readonly after: unknown;
}

/** What a Step did to one Worker key: its Condition named it anew, dropped it, or kept it. */
export type Life = 'started' | 'stopped' | 'kept';

/** One key a Worker's Condition names, and what the Step did to it. */
export interface WorkerKey {
  /** `''` for every kind but `each`. */
  readonly key: string;
  readonly life: Life;
}

/** One of an Instance's Workers at a Step: one per key its Condition names, and what the Step did to it. */
export interface WorkerRow extends WorkerKey {
  readonly name: string;
}

/** One Instance at a Step, and what the Step did to it. */
export interface Row {
  /** As it is after the Step, or as it was if the Step stopped it. */
  readonly instance: Instance;
  /** How deep it is in the tree; the root is 0. */
  readonly depth: number;
  readonly life: 'started' | 'stopped' | 'kept';
  /** The State it left and entered, if the Step was a Transition for it. */
  readonly transition:
    | { readonly from: string; readonly to: string }
    | undefined;
  readonly fields: ReadonlyArray<Field>;
  /** Its Workers as the Step leaves them, and the ones the Step stopped. Empty without its Actor's definition. */
  readonly workers: ReadonlyArray<WorkerRow>;
}

/** Whether the Step did anything to this Instance. */
export const touched = (row: Row) =>
  row.life !== 'kept' ||
  row.transition !== undefined ||
  row.fields.length > 0 ||
  row.workers.some((worker) => worker.life !== 'kept');

const remembered = new WeakMap<
  Snapshot,
  {
    readonly before: Snapshot | undefined;
    readonly definition: Definition | undefined;
    readonly rows: ReadonlyArray<Row>;
  }
>();

/**
 * Every Instance before and after a Step, in tree order; init starts them
 * all. With the root Actor's definition, each Row also carries its Workers.
 */
export const rowsOf = (
  { before, after }: Around,
  definition?: Definition,
): ReadonlyArray<Row> => {
  const known = remembered.get(after);
  if (known && known.before === before && known.definition === definition)
    return known.rows;
  const rows: Array<Row> = [];
  const walk = (
    actor: Definition | undefined,
    was: Instance | undefined,
    is: Instance | undefined,
    depth: number,
  ) => {
    rows.push(rowOf(actor, was, is, depth));
    const olds = was ? slotted(was) : [];
    const nows = is ? slotted(is) : [];
    const now = new Set(nows.map(([, kid]) => kid.id));
    for (const [slot, kid] of nows)
      walk(
        childOf(actor, is!, slot),
        olds.find(([, old]) => old.id === kid.id)?.[1],
        kid,
        depth + 1,
      );
    for (const [slot, old] of olds)
      if (!now.has(old.id))
        walk(childOf(actor, was!, slot), old, undefined, depth + 1);
  };
  walk(definition, before, after, 0);
  remembered.set(after, { before, definition, rows });
  return rows;
};

/** An Instance's Children, every slot, in order, each with its slot's name. */
const slotted = (
  instance: Instance,
): ReadonlyArray<readonly [slot: string, kid: Instance]> =>
  Object.entries(instance.children).flatMap(([slot, held]) =>
    (isMany(held) ? held : [held]).map((kid) => [slot, kid] as const),
  );

/** The Actor a parent Invokes in one slot while in its State. */
const childOf = (
  actor: Definition | undefined,
  parent: Instance,
  slot: string,
): Definition | undefined =>
  actor?.children[parent.state._tag]?.[slot]?.definition;

const rowOf = (
  actor: Definition | undefined,
  was: Instance | undefined,
  is: Instance | undefined,
  depth: number,
): Row => {
  const workers = workersOf(actor, was, is);
  if (!was || !is)
    return {
      instance: (is ?? was)!,
      depth,
      life: is ? 'started' : 'stopped',
      transition: undefined,
      fields: [],
      workers,
    };
  const fields: Array<Field> = [];
  fieldsOf('model', was.model, is.model, [], fields);
  const moved = was.state._tag !== is.state._tag;
  if (!moved) fieldsOf('state', dataOf(was), dataOf(is), [], fields);
  return {
    instance: is,
    depth,
    life: 'kept',
    transition: moved ? { from: was.state._tag, to: is.state._tag } : undefined,
    fields,
    workers,
  };
};

/** The Workers an Instance expects: one per key each Condition names for its data. */
export const expectedOf = (
  actor: Definition,
  instance: Instance,
): ReadonlyArray<{ readonly name: string; readonly key: string }> =>
  Object.entries(actor.workers).flatMap(([name, worker]) =>
    worker
      .keys({ model: instance.model, state: instance.state })
      .map((key) => ({ name, key })),
  );

/**
 * One Worker's keys before and after a Step, each with what the Step did to
 * it: the keys after, started or kept in their order, then the ones stopped.
 */
export const keyLives = (
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): ReadonlyArray<WorkerKey> => {
  const olds = new Set(before);
  const nows = new Set(after);
  return [
    ...after.map((key): WorkerKey => ({
      key,
      life: olds.has(key) ? 'kept' : 'started',
    })),
    ...before
      .filter((key) => !nows.has(key))
      .map((key): WorkerKey => ({ key, life: 'stopped' })),
  ];
};

/** The keys a Worker's Condition names for an Instance, if it runs. */
const keysOf = (
  worker: Definition['workers'][string],
  instance: Instance | undefined,
): ReadonlyArray<string> =>
  instance ? worker.keys({ model: instance.model, state: instance.state }) : [];

/** The Workers after the Step, started or kept, then the ones it stopped, Worker by Worker. */
const workersOf = (
  actor: Definition | undefined,
  was: Instance | undefined,
  is: Instance | undefined,
): ReadonlyArray<WorkerRow> =>
  actor
    ? Object.entries(actor.workers).flatMap(([name, worker]) =>
        keyLives(keysOf(worker, was), keysOf(worker, is)).map(
          (key): WorkerRow => ({ name, ...key }),
        ),
      )
    : [];

/** A State's data, without its tag. */
export const dataOf = (instance: Instance): Record<string, unknown> => {
  const { _tag, ...data } = instance.state as Record<string, unknown>;
  return data;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

const fieldsOf = (
  where: Field['in'],
  before: unknown,
  after: unknown,
  path: ReadonlyArray<string | number>,
  out: Array<Field>,
) => {
  if (Object.is(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let at = 0; at < length; at++)
      if (at >= before.length)
        out.push({
          in: where,
          path: [...path, at],
          kind: 'added',
          before: undefined,
          after: after[at],
        });
      else if (at >= after.length)
        out.push({
          in: where,
          path: [...path, at],
          kind: 'removed',
          before: before[at],
          after: undefined,
        });
      else fieldsOf(where, before[at], after[at], [...path, at], out);
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (!(key in before))
        out.push({
          in: where,
          path: [...path, key],
          kind: 'added',
          before: undefined,
          after: after[key],
        });
      else if (!(key in after))
        out.push({
          in: where,
          path: [...path, key],
          kind: 'removed',
          before: before[key],
          after: undefined,
        });
      else fieldsOf(where, before[key], after[key], [...path, key], out);
    return;
  }
  if (
    before instanceof Date &&
    after instanceof Date &&
    before.getTime() === after.getTime()
  )
    return;
  out.push({ in: where, path, kind: 'changed', before, after });
};

/** A path to read: `items[2].done`. */
export const pathName = (path: ReadonlyArray<string | number>) =>
  path
    .map((part, at) =>
      typeof part === 'number' ? `[${part}]` : at === 0 ? part : `.${part}`,
    )
    .join('');
