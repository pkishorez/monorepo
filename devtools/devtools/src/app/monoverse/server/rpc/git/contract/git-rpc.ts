import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import {
  At,
  GitUnavailableError,
  InvalidRootError,
} from '../../project/contract/index.js';
import { BranchesSchema, ChangeSetSchema, FileDiffSchema } from './changes.js';
import {
  FileContentSchema,
  FileNotFoundError,
  FileOutsideError,
  FileReadError,
} from './files.js';

const GitError = Schema.Union([InvalidRootError, GitUnavailableError]);

const ReadFileError = Schema.Union([
  InvalidRootError,
  FileNotFoundError,
  FileOutsideError,
  FileReadError,
  GitUnavailableError,
]);

/**
 * Git's answers about a Project: its branches, what a branch changed
 * since it left another, and one file as a branch has it. Every path is
 * relative to the root.
 */
export const GitRpc = RpcGroup.make(
  Rpc.make('GetBranches', {
    payload: { root: Schema.String },
    success: BranchesSchema,
    error: GitError,
  }),
  /** What `branch` changed since it left `base`. */
  Rpc.make('GetChanges', {
    payload: { ...At, base: Schema.String },
    success: ChangeSetSchema,
    error: GitError,
  }),
  Rpc.make('GetFileDiff', {
    payload: { ...At, base: Schema.String, path: Schema.String },
    success: FileDiffSchema,
    error: GitError,
  }),
  /** One file of the Project at a branch, by its root-relative path. */
  Rpc.make('ReadFile', {
    payload: { ...At, path: Schema.String },
    success: FileContentSchema,
    error: ReadFileError,
  }),
);
