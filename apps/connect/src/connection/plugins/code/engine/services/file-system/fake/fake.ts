import { Schema } from 'effect';
import { sampleProject } from './git.js';
import { fromHome } from './paths.js';
import { ensureFolders, put, textFile, Tree, treeWith } from './tree.js';

/*
 * One computer's disk, faked, as plain data: its home and the whole tree
 * (tree.ts). It starts as an empty home at `/home/you`. Whoever keeps it
 * (the Computers fake, a test) changes it with the functions here, in a
 * person's words: a sample project, a folder, a file; the app's own
 * changes come through the File System key (layer.ts). A path a person
 * gives is written as they would: `~/code`, `code` (from home) or
 * absolute.
 */

/** The home of a new computer. */
export const HOME = '/home/you';

export const FileSystemState = Schema.Struct({
  /** The user's home folder. */
  home: Schema.String,
  /** Every entry, by its absolute path. */
  tree: Tree,
});
export type FileSystemState = typeof FileSystemState.Type;

/** A new computer's disk: `/home/you`, empty. */
export const emptyHome: FileSystemState = { home: HOME, tree: treeWith(HOME) };

/** A change a person makes to a disk. */
export type DiskChange = (disk: FileSystemState) => FileSystemState;

/** A project with a few files and a git repository on `main`, with branches and an Origin. */
export const addSampleProject =
  (folder: string): DiskChange =>
  (disk) => ({
    ...disk,
    tree: sampleProject(disk.tree, fromHome(disk.home, folder)),
  });

/** A folder, with every folder on the way; one named `.something` is hidden. */
export const addFolder =
  (folder: string): DiskChange =>
  (disk) => ({
    ...disk,
    tree: ensureFolders(disk.tree, fromHome(disk.home, folder)),
  });

/** A file holding the text given, the folders on the way made. */
export const addFile =
  (file: string, text: string): DiskChange =>
  (disk) => ({
    ...disk,
    tree: put(disk.tree, fromHome(disk.home, file), textFile(text)),
  });
