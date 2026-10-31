import { History as Histories } from '../history/index.ts';

/*
 * `History`: everything that happened to an app, as a tree of entries, one
 * per Message. A Runtime starts from one; a saved one is plain JSON.
 */

/** A new History of an Actor, empty: it plays from init. */
export const make = Histories.make;
/** A History read back from its saved JSON. */
export const load = Histories.load;
/** A History of one Restore: it starts at a Snapshot saved before. */
export const restored = Histories.restored;

export type {
  History,
  Entry,
  HistoryOptions as Options,
  SavedHistory as Saved,
} from '../history/index.ts';
