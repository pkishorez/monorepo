import type { Entry } from 'effect-oak';
import type { Step } from '../../step/index.ts';

/*
 * The Timeline as a graph: every entry on every Branch, one row each, newest
 * first, down to init. The first Branch runs down lane 0, and each fork gets
 * a lane of its own to the right, for good. Pure.
 */

export interface Lane {
  readonly step: Step;
  /** Which lane its dot sits in, for good; 0 is the first Branch. */
  readonly lane: number;
  /** The row and lane of the Step before it, for the line that joins them. */
  readonly parent: { readonly row: number; readonly lane: number } | null;
}

export interface Lanes {
  /** Newest first; init is last. */
  readonly rows: ReadonlyArray<Lane>;
  readonly width: number;
}

/**
 * Each Branch keeps the lane it was born in: an entry takes its parent's lane
 * if it is the first to follow it, else a new lane to the right of every
 * other. Entries only ever append, so no lane ever changes.
 */
export const lanesOf = (all: ReadonlyArray<Entry>): Lanes => {
  const lane = new Map<number, number>();
  const taken = new Set<number | null>();
  let width = 1;
  for (const entry of all) {
    const first = !taken.has(entry.parent);
    taken.add(entry.parent);
    lane.set(
      entry.id,
      first ? (entry.parent === null ? 0 : lane.get(entry.parent)!) : width++,
    );
  }

  const ordered = [...all].sort((a, b) => b.id - a.id);
  const rowOf = new Map(ordered.map((entry, row) => [entry.id, row]));
  const initRow = ordered.length;
  const rows: Array<Lane> = ordered.map((entry) => ({
    step: entry,
    lane: lane.get(entry.id)!,
    parent:
      entry.parent === null
        ? { row: initRow, lane: 0 }
        : { row: rowOf.get(entry.parent)!, lane: lane.get(entry.parent)! },
  }));
  rows.push({ step: 'init', lane: 0, parent: null });
  return { rows, width };
};
