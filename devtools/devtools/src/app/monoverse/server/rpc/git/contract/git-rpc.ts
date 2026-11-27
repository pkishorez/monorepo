import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import {
  At,
  GitUnavailableError,
  InvalidRootError,
} from '../../project/contract/index.js';
import {
  BranchesSchema,
  ChangeSetSchema,
  FileDiffSchema,
  WorktreeSchema,
} from './changes.js';
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

export const GitRpc = RpcGroup.make(
  Rpc.make('GetBranches', {
    payload: { root: Schema.String },
    success: BranchesSchema,
    error: GitError,
  }),
  Rpc.make('GetWorktrees', {
    payload: { root: Schema.String },
    success: Schema.Array(WorktreeSchema),
    error: GitError,
  }),
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
  Rpc.make('ReadFile', {
    payload: { ...At, path: Schema.String },
    success: FileContentSchema,
    error: ReadFileError,
  }),
);
