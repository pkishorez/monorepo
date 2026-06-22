import type { Slice } from './slice.js';

export const topSlice = <TItem>(
  slices: readonly Slice<TItem>[],
): Slice<TItem> | null => slices[slices.length - 1] ?? null;

export const bottomSlice = <TItem>(
  slices: readonly Slice<TItem>[],
): Slice<TItem> | null => slices[0] ?? null;
