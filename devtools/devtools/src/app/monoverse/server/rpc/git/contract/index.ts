// Git mode: a Project's branches, what a branch changed since it left
// another, and one file's diff.
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
