// RPC transports use this browser-safe runtime contract for Change sets.
export {
  BranchSchema,
  ChangedPathSchema,
  ChangeSetSchema,
  ChangeStatusSchema,
  DiffHunkSchema,
  DiffLineSchema,
  FileDiffSchema,
} from './change-set-schema.js';
// Renderers name the change decoration they apply to an Architecture Analysis.
export type {
  Branch,
  ChangedPath,
  ChangeSet,
  ChangeStatus,
  DiffHunk,
  DiffLine,
  FileDiff,
} from './change-set-schema.js';
