import { Schema } from 'effect';
import type { Entity } from '../../../core/index.js';
import type { StateEntitySchema } from '../state/index.js';

export type Cursor<TItem> = Entity<TItem>;

export type Slice<TItem> = {
  low: Cursor<TItem>;
  high: Cursor<TItem>;
  itemCount: number;
};

export const makeSlice = <TItem>(
  low: Cursor<TItem>,
  high: Cursor<TItem>,
): Slice<TItem> => ({ low, high, itemCount: 0 });

export const sliceSchema = (entity: StateEntitySchema) =>
  Schema.Struct({ low: entity, high: entity, itemCount: Schema.Number });

export const uOf = <TItem>(entity: Cursor<TItem>): string => entity.meta._u;

export const oldestOf = <TItem>(batch: Entity<TItem>[]): Cursor<TItem> =>
  batch.reduce((oldest, entity) =>
    uOf(entity) < uOf(oldest) ? entity : oldest,
  );

export const newestOf = <TItem>(batch: Entity<TItem>[]): Cursor<TItem> =>
  batch.reduce((newest, entity) =>
    uOf(entity) > uOf(newest) ? entity : newest,
  );

export const reconcile = <TItem>(
  slices: readonly Slice<TItem>[],
  candidate: Slice<TItem>,
): Slice<TItem>[] => {
  const ordered = [...slices, candidate].sort((left, right) =>
    uOf(left.low) < uOf(right.low)
      ? -1
      : uOf(left.low) > uOf(right.low)
        ? 1
        : 0,
  );
  const merged: Slice<TItem>[] = [];
  for (const slice of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && uOf(slice.low) <= uOf(previous.high)) {
      if (uOf(slice.high) > uOf(previous.high)) previous.high = slice.high;
    } else {
      merged.push(makeSlice(slice.low, slice.high));
    }
  }
  return merged;
};

export const topSlice = <TItem>(
  slices: readonly Slice<TItem>[],
): Slice<TItem> | null => slices[slices.length - 1] ?? null;

export const bottomSlice = <TItem>(
  slices: readonly Slice<TItem>[],
): Slice<TItem> | null => slices[0] ?? null;
