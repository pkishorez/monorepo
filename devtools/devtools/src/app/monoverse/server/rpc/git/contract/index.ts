// Git mode: a Project's branches, what a branch changed since it left
// another, one file's diff, and one file as a branch has it.
export { GitRpc } from './git-rpc.js';
export {
  BranchesSchema,
  BranchSchema,
  ChangedPathSchema,
  ChangeSetSchema,
  ChangeStatusSchema,
  FileDiffSchema,
} from './changes.js';
export type {
  Branch,
  Branches,
  ChangedPath,
  ChangeSet,
  ChangeStatus,
  DiffHunk,
  DiffLine,
  FileDiff,
} from './changes.js';
export {
  FileContentSchema,
  FileNotFoundError,
  FileOutsideError,
  FileReadError,
} from './files.js';
export type { FileContent } from './files.js';
