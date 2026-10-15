import type { Point, Saved } from './memory.ts';

/*
 * The browser's session storage, for the Memory to outlast a reload: one
 * tab's own, copied when the tab is duplicated, empty in a new one. It is
 * read once and written when an entry is left or the page is hidden, never
 * while scrolling. Storage that is full, or missing, keeps nothing.
 */

const KEY = '@kestack/kabuki/routing:scroll';

const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((each) => typeof each === 'number');

const isPair = <T>(value: unknown, second: (each: unknown) => each is T) =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  second(value[1]);

const isAreas = (value: unknown): value is ReadonlyArray<[string, Point]> =>
  Array.isArray(value) && value.every((each) => isPair(each, isPoint));

const isSaved = (value: unknown): value is Saved => {
  const { entries, places } = (value ?? {}) as Record<string, unknown>;
  return (
    Array.isArray(entries) &&
    entries.every((each) => isPair(each, isAreas)) &&
    isAreas(places)
  );
};

/** What the last page load in this tab saved, if it reads. */
export const read = (): Saved | undefined => {
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY);
    const saved: unknown = raw ? JSON.parse(raw) : undefined;
    return isSaved(saved) ? saved : undefined;
  } catch {
    return undefined;
  }
};

export const write = (saved: Saved) => {
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(saved));
  } catch {}
};
