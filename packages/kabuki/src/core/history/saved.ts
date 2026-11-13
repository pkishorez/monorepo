import type { ActorDefinition, Tagged } from '../actor/index.ts';
import { actorFor } from '../snapshot/index.ts';
import type { SavedSnapshot } from '../snapshot/index.ts';
import type { HistoryEntry } from './replay.ts';

/*
 * Saved: a History as plain JSON. In memory every value is decoded; saved,
 * its start is a saved Snapshot, and each Message is its Actor's Schema's
 * encoded side. So only that side must be JSON-safe.
 *
 * 1. Encode  an entry, through the Schema of the Actor it is for, once per
 *            entry. One that does not fit is saved as it is: it never plays.
 * 2. Decode  an entry read back. One that no longer fits the code is kept
 *            as it was saved: Replay warns of it and skips it.
 * 3. Check   a saved History's shape before it is read: ids rise, but
 *            need not start at 0 or follow on, once it is Compacted.
 */

/** A History as plain JSON, to keep and load again: its start as a saved Snapshot, and every Message as its Actor's Schema encodes it. */
export interface SavedHistory {
  readonly start: SavedSnapshot;
  /** Oldest first, by id. */
  readonly entries: ReadonlyArray<HistoryEntry>;
  readonly head: number | null;
}

const encoded = new WeakMap<
  ActorDefinition,
  WeakMap<HistoryEntry, HistoryEntry>
>();

const known = (root: ActorDefinition) => {
  let byEntry = encoded.get(root);
  if (!byEntry) encoded.set(root, (byEntry = new WeakMap()));
  return byEntry;
};

// 1. Encode
export const encodeEntry = (
  root: ActorDefinition,
  entry: HistoryEntry,
): HistoryEntry => {
  const cache = known(root);
  const found = cache.get(entry);
  if (found) return found;
  const written = Object.freeze(convert(root, entry, 'encode'));
  cache.set(entry, written);
  return written;
};

// 2. Decode
/** An entry read back; saving it again gives the entry it was read from. */
export const decodeEntry = (
  root: ActorDefinition,
  entry: HistoryEntry,
): HistoryEntry => {
  const decoded = convert(root, entry, 'decode');
  if (decoded !== entry) known(root).set(decoded, entry);
  return decoded;
};

/**
 * An entry with its Message through its Actor's Schema. A value that does
 * not fit is given back as it is: it was dropped live, or Replay skips it,
 * so it never plays.
 */
const convert = (
  root: ActorDefinition,
  entry: HistoryEntry,
  way: 'encode' | 'decode',
): HistoryEntry => {
  try {
    const definition = actorFor(root, entry.to);
    return definition
      ? {
          ...entry,
          message: definition.encoding.message[way](entry.message) as Tagged,
        }
      : entry;
  } catch {
    return entry;
  }
};

// 3. Check
/** Throws, saying what is wrong, unless `saved` is a History's shape: entries by rising id, each after an earlier one, and a Head among them. */
export const checkSaved = (saved: SavedHistory): void => {
  const fail = (why: string) => {
    throw new TypeError(
      `[@kestack/kabuki] the saved History is corrupt: ${why}`,
    );
  };
  if (!saved || !Array.isArray(saved.entries)) fail('it has no entries');
  const seen = new Set<number>();
  let last = -1;
  saved.entries.forEach((entry, index) => {
    const id = entry?.id;
    if (!(Number.isInteger(id) && id > last))
      fail(`entry ${index} has the id ${id}, not one after ${last}`);
    const { parent } = entry;
    if (parent !== null && !seen.has(parent))
      fail(`entry ${id} follows ${parent}, not an entry before it`);
    seen.add(id);
    last = id;
  });
  const { head } = saved;
  if (head !== null && !seen.has(head))
    fail(`its Head ${head} is not one of its ${saved.entries.length} entries`);
};
