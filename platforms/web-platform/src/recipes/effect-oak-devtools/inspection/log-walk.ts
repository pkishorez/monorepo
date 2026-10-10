import type { Entry } from 'effect-oak';

/*
 * Walking the Log, which is a tree of entries: every entry on every Branch,
 * the Branch up to any entry, and the tip a Branch grows to. Pure.
 */

/** Every entry on every Branch, from the children of each, in the order they came. */
export const allEntries = (
  children: (of: number | null) => ReadonlyArray<Entry>,
): ReadonlyArray<Entry> => {
  // A loop, not recursion: one Branch can be many thousands of entries deep.
  const all: Array<Entry> = [];
  const waiting: Array<number | null> = [null];
  while (waiting.length > 0)
    for (const child of children(waiting.pop()!)) {
      all.push(child);
      waiting.push(child.id);
    }
  return all.sort((a, b) => a.id - b.id);
};

/** The entries from the first to `tip`, following `parent`. */
export const pathTo = (
  byId: ReadonlyMap<number, Entry>,
  tip: number | null,
): ReadonlyArray<Entry> => {
  const back: Array<Entry> = [];
  for (let id = tip; id !== null; id = byId.get(id)!.parent)
    back.push(byId.get(id)!);
  return back.reverse();
};

/** From an entry down to the latest entry grown after it: the tip of its Branch. */
export const tipFrom = (
  entry: Entry,
  children: (of: number | null) => ReadonlyArray<Entry>,
): Entry => {
  let tip = entry;
  for (let next = children(tip.id); next.length > 0; next = children(tip.id))
    tip = next.at(-1)!;
  return tip;
};
