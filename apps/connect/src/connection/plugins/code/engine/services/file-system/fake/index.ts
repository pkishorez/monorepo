/*
 * The File System fake: one computer's disk, in a browser tab, as plain
 * data. It starts as an empty home; `addSampleProject`, `addFolder` and
 * `addFile` change it as a person would (a sample project with its git
 * repository, folders, files); `fileSystemOver` gives the File System key
 * over it, wherever it is kept (`Disk`): the Computers fake keeps each
 * computer's in its own state, a test in a state of its own (`diskOf`).
 * Browser-safe: nothing here imports Node.
 */

export {
  addFile,
  addFolder,
  addSampleProject,
  emptyHome,
  FileSystemState,
  HOME,
  type DiskChange,
} from './fake.js';
export { diskOf, fileSystemOver, type Disk } from './layer.js';
export {
  branchOfHead,
  configText,
  originOf,
  parseConfig,
  shaOf,
  type GitConfig,
} from './git.js';
export type { Entry, Tree } from './tree.js';
