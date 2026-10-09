/* A small made-up file tree, browsed by the rest of the path after /files. */

export type Entry =
  | { readonly _tag: 'File'; readonly name: string; readonly bytes: number }
  | {
      readonly _tag: 'Directory';
      readonly name: string;
      readonly entries: ReadonlyArray<Entry>;
    };

const file = (name: string, bytes: number): Entry => ({
  _tag: 'File',
  name,
  bytes,
});
const directory = (name: string, entries: ReadonlyArray<Entry>): Entry => ({
  _tag: 'Directory',
  name,
  entries,
});

export const TREE: ReadonlyArray<Entry> = [
  directory('documents', [
    file('resume.pdf', 48_230),
    directory('taxes', [file('2024.pdf', 182_400), file('2025.pdf', 196_812)]),
  ]),
  directory('photos', [
    directory('vacation', [
      file('beach.jpg', 2_348_100),
      file('sunset.jpg', 1_982_450),
    ]),
  ]),
  file('notes.txt', 1_204),
];

/** The entry at a path, or undefined if nothing is there. */
export const entryAt = (path: ReadonlyArray<string>): Entry | undefined => {
  let entries = TREE;
  let found: Entry | undefined;
  for (const name of path) {
    found = entries.find((entry) => entry.name === name);
    if (!found) return undefined;
    entries = found._tag === 'Directory' ? found.entries : [];
  }
  return found;
};

export const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes >= 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${bytes} B`;
