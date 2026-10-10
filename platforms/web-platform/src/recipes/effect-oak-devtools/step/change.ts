import type { Instance, Snapshot } from 'effect-oak';
import { kidsOf } from './step.ts';
import type { Around } from './step.ts';

/*
 * A Step's Change, worked out from the Snapshots right before and after it:
 * one Row per Instance, in tree order, saying whether the Step started or
 * stopped it, moved its State, and which fields of its Model or State took a
 * new value. Fields are compared down to plain values, lists by position;
 * equal contents are no change. Pure, and remembered per pair of Snapshots.
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
}

/** Whether the Step did anything to this Instance. */
export const touched = (row: Row) =>
  row.life !== 'kept' || row.transition !== undefined || row.fields.length > 0;

const remembered = new WeakMap<
  Snapshot,
  { readonly before: Snapshot | undefined; readonly rows: ReadonlyArray<Row> }
>();

/** Every Instance before and after a Step, in tree order; init starts them all. */
export const rowsOf = ({ before, after }: Around): ReadonlyArray<Row> => {
  const known = remembered.get(after);
  if (known && known.before === before) return known.rows;
  const rows: Array<Row> = [];
  const walk = (
    was: Instance | undefined,
    is: Instance | undefined,
    depth: number,
  ) => {
    rows.push(rowOf(was, is, depth));
    const olds = was ? kidsOf(was) : [];
    const nows = is ? kidsOf(is) : [];
    const now = new Set(nows.map((kid) => kid.id));
    for (const kid of nows)
      walk(
        olds.find((old) => old.id === kid.id),
        kid,
        depth + 1,
      );
    for (const old of olds)
      if (!now.has(old.id)) walk(old, undefined, depth + 1);
  };
  walk(before, after, 0);
  remembered.set(after, { before, rows });
  return rows;
};

const rowOf = (
  was: Instance | undefined,
  is: Instance | undefined,
  depth: number,
): Row => {
  if (!was || !is)
    return {
      instance: (is ?? was)!,
      depth,
      life: is ? 'started' : 'stopped',
      transition: undefined,
      fields: [],
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
  };
};

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
