import type { EntityType } from '@std-toolkit/core';
import type { Cursor } from './slice.js';

export const uOf = <TItem>(entity: Cursor<TItem>): string => entity.meta._u;

export const oldestOf = <TItem>(batch: EntityType<TItem>[]): Cursor<TItem> =>
  batch.reduce((acc, e) => (uOf(e) < uOf(acc) ? e : acc));

export const newestOf = <TItem>(batch: EntityType<TItem>[]): Cursor<TItem> =>
  batch.reduce((acc, e) => (uOf(e) > uOf(acc) ? e : acc));
