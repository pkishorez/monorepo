import { Schema } from 'effect';
import { MetaSchema } from '@std-toolkit/core';
import type { EntityType } from '@std-toolkit/core';

export type Cursor<TItem> = EntityType<TItem>;

/** A contiguous loaded `_u` range; `itemCount` is a placeholder set by the inspector. */
export type Slice<TItem> = {
  low: Cursor<TItem>;
  high: Cursor<TItem>;
  itemCount: number;
};

export const makeSlice = <TItem>(
  low: Cursor<TItem>,
  high: Cursor<TItem>,
): Slice<TItem> => ({ low, high, itemCount: 0 });

const CursorSchema = Schema.Struct({
  value: Schema.Unknown,
  meta: MetaSchema,
});

export const SliceSchema = Schema.Struct({
  low: CursorSchema,
  high: CursorSchema,
  itemCount: Schema.Number,
});
