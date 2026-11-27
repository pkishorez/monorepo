import { Context, Data, type Effect } from 'effect';

import type { Branches, Worktree } from '../../../rpc/git/contract/index.js';
import type { GitUnavailableError } from '../../../rpc/project/contract/index.js';

export class GitError extends Data.TaggedError('GitError')<{
  readonly reason: 'not-a-repo' | 'unknown-ref' | 'command-failed';
  readonly baseDir: string;
  readonly cause: unknown;
}> {}

export type Repository = {
  readonly toplevel: string;
  readonly prefix: string;
  readonly current: string | null;
  readonly worktrees: ReadonlyArray<Checkout>;
};

export type Checkout = {
  readonly root: string;
  readonly head: string;
  readonly branch: string | null;
  readonly primary: boolean;
};

export type Placement =
  | { readonly kind: 'worktree'; readonly folder: string }
  | {
      readonly kind: 'commit';
      readonly repository: Repository;
      readonly commit: string;
    };

export interface GitShape {
  readonly run: (
    baseDir: string,
    args: readonly string[],
  ) => Promise<{
    readonly stdout: string;
    readonly stderr: string;
    readonly ok: boolean;
  }>;
  readonly require: (
    baseDir: string,
    args: readonly string[],
    reason: GitError['reason'],
  ) => Promise<string>;
  readonly splitNul: (stdout: string) => string[];
  readonly locateRepository: (root: string) => Promise<Repository>;
  readonly worktreeFolder: (
    repository: Repository,
    root: string,
    branch: string,
  ) => Promise<string | null>;
  readonly placeBranch: (
    root: string,
    branch: string | null,
  ) => Promise<Placement>;
  readonly listBranches: (root: string) => Promise<Branches>;
  readonly listWorktrees: (root: string) => Promise<ReadonlyArray<Worktree>>;
  readonly attempt: <A>(
    run: () => Promise<A>,
  ) => Effect.Effect<A, GitUnavailableError>;
}

export class Git extends Context.Service<Git, GitShape>()(
  'Monoverse/server/Git',
) {}
