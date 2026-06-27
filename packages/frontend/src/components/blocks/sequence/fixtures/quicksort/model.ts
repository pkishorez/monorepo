import type { Canvas } from '../../index';

/**
 * Data model for the quicksort demo: the persistent bar set, the per-role paint
 * values (colour + shadow), and the bar-geometry helper. Pure data + types — no
 * JSX — so the scene components share one source of truth.
 */

/** A single bar: a stable id (its `layoutId`) plus the value it represents. */
export type QBar = { id: string; value: number };

/** The persistent values, keyed by bar id. A bar's value never changes. */
export const QVALUES: Record<string, number> = {
  a: 5,
  b: 2,
  c: 8,
  d: 1,
  e: 9,
  f: 3,
};

/** Build a bar list from ids, looking each value up from {@link QVALUES}. */
export const q = (...ids: string[]): QBar[] =>
  ids.map((id) => ({ id, value: QVALUES[id] }));

/** Bar height in px (canvas-relative), proportional to value. */
export const barHeight = (cw: Canvas['cw'], value: number) =>
  cw(value * 2.76 + 2.2);

/** Per-role background colours the bars cross-fade between. */
export const PALETTE = {
  slate: '#64748b',
  pivot: '#8b5cf6',
  less: '#3b82f6',
  greater: '#f43f5e',
  sorted: '#10b981',
} as const;

/** Box-shadows paired with the colours above. */
export const shadow = {
  rest: '0 6px 16px -8px rgba(15,23,42,0.45)',
  pivot:
    '0 0 0 3px rgba(139,92,246,0.45), 0 8px 22px -8px rgba(139,92,246,0.5)',
  sorted: '0 10px 24px -8px rgba(16,185,129,0.55)',
} as const;

/** Per-frame partition state for the bars scene. */
export type BarsProps = {
  order: QBar[];
  pivot: string | null;
  less: string[];
  greater: string[];
  sorted: string[];
};

/** Positional helper that assembles a {@link BarsProps} for one frame. */
export const bar = (
  order: QBar[],
  pivot: string | null,
  less: string[],
  greater: string[],
  sorted: string[],
): BarsProps => ({
  order,
  pivot,
  less,
  greater,
  sorted,
});
