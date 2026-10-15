/*
 * Where each Scroll area was, kept two ways, each up to `size`, the least
 * recently used dropped first:
 *
 * - by entry  every area on a history entry, by the entry's key: what
 *             Back and Forward, and a reload, go back to.
 * - by place  every area of a place, by its key and query: what any visit
 *             goes back to.
 *
 * An area is named by its place's key and its own name. Nothing here
 * touches the page or the browser's storage.
 */

/** Where an area was scrolled to, across and down. */
export type Point = readonly [x: number, y: number];

/** Everything kept, as plain data: what is saved for the next page load. */
export interface Saved {
  readonly entries: ReadonlyArray<
    readonly [entry: string, areas: ReadonlyArray<readonly [string, Point]>]
  >;
  readonly places: ReadonlyArray<readonly [area: string, at: Point]>;
}

/** Where an area is kept: on an entry, or, with `entry` `null`, for its place. */
export interface Where {
  readonly entry: string | null;
  readonly area: string;
}

export interface Memory {
  readonly get: (where: Where) => Point | undefined;
  readonly set: (where: Where, at: Point) => void;
  readonly saved: () => Saved;
}

/** Puts `key` last, as the most recently used, and drops the oldest past `size`. */
const touch = <V>(map: Map<string, V>, key: string, value: V, size: number) => {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= size) break;
    map.delete(oldest);
  }
};

/** A Memory, starting from what a page load before saved, if anything. */
export const memory = (from?: Saved, size = 100): Memory => {
  const entries = new Map(
    (from?.entries ?? []).map(([entry, areas]) => [entry, new Map(areas)]),
  );
  const places = new Map(from?.places ?? []);
  return {
    get: ({ entry, area }) =>
      entry === null ? places.get(area) : entries.get(entry)?.get(area),
    set: ({ entry, area }, at) => {
      if (entry === null) return touch(places, area, at, size);
      touch(entries, entry, entries.get(entry) ?? new Map(), size);
      entries.get(entry)!.set(area, at);
    },
    saved: () => ({
      entries: [...entries].map(([entry, areas]) => [entry, [...areas]]),
      places: [...places],
    }),
  };
};
