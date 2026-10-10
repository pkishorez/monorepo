import type { Brand } from './brand.js';

export type WindowKey = string & Brand<'WindowKey'>;

export type WindowValue = string | number | boolean;

export const GLOBAL_WINDOW_KEY = '__total__' as WindowKey;

// Stable regardless of field insertion order; the map and ref-count key of a Window.
export const windowKey = (fields: Record<string, WindowValue>): WindowKey =>
  JSON.stringify(
    Object.entries(fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => [field, typeof value, value]),
  ) as WindowKey;
