import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import {
  At,
  GitUnavailableError,
  InvalidRootError,
} from '../../project/contract/index.js';
import { BranchesSchema, ChangeSetSchema, FileDiffSchema } from './changes.js';

const GitError = Schema.Union([InvalidRootError, GitUnavailableError]);

/**
 * Git's answers about a Project: its branches, and what a branch changed
 * since it left another. Every path is relative to the root.
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
);
