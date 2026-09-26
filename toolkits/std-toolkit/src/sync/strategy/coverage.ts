import { Schema } from 'effect';
import type { Entity } from '../../core/index.js';
import type { StateEntitySchema } from './definition.js';

/** A stretch of the Backend, from `low` to `high` by `_u`, read completely. */
export type Slice<TItem> = {
  readonly low: Entity<TItem>;
  readonly high: Entity<TItem>;
};

export const sliceSchema = (entity: StateEntitySchema) =>
  Schema.Struct({ low: entity, high: entity });

const u = <TItem>(entity: Entity<TItem>) => entity.meta._u;

/** Adds a slice and merges every pair that touches or overlaps. */
export const cover = <TItem>(
  slices: ReadonlyArray<Slice<TItem>>,
  added: Slice<TItem>,
): Slice<TItem>[] => {
  const ordered = [...slices, added].sort((left, right) =>
    u(left.low) < u(right.low) ? -1 : u(left.low) > u(right.low) ? 1 : 0,
  );
  const merged: Slice<TItem>[] = [];
  for (const slice of ordered) {
    const previous = merged.at(-1);
    if (previous && u(slice.low) <= u(previous.high)) {
      if (u(slice.high) > u(previous.high))
        merged[merged.length - 1] = { low: previous.low, high: slice.high };
    } else {
      merged.push(slice);
    }
  }
  return merged;
};
