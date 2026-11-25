import type { Runtime } from '@kestack/kabuki';
import { CONTROLS, FileSystemFake } from './actor.js';
import { fileSystemOver, handleOf } from './serve.js';

/*
 * The File System Fake: one computer's disk, in a browser tab. Its Actor
 * starts blank, an empty home; its Controls make the world (a sample
 * project with its git repository, folders, files); `serve` gives the File
 * System key over the running Actor. A computer's File System inside
 * another Fake is served with `fileSystemOver(handleOf(instance))`.
 * Browser-safe: nothing here imports Node.
 */

export const fileSystem = {
  name: 'File System',
  actor: FileSystemFake,
  controls: CONTROLS,
  serve: (runtime: Runtime<typeof FileSystemFake>) =>
    fileSystemOver(handleOf(runtime.root)),
};

export {
  blank,
  CONTROLS,
  FileSystemFake,
  HOME,
  type FileSystemMessage,
  type FileSystemModel,
} from './actor.js';
export { fileSystemOver, handleOf, type FileSystemHandle } from './serve.js';
export {
  branchOfHead,
  configText,
  originOf,
  parseConfig,
  shaOf,
  type GitConfig,
} from './git.js';
export type { Entry, Tree } from './tree.js';
