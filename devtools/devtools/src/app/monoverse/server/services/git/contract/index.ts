import { Context, Data, type Effect } from 'effect';

import type { Branches } from '../../../rpc/git/contract/index.js';
import type { GitUnavailableError } from '../../../rpc/project/contract/index.js';

/*
 * Running git as a child process in one folder, and where a Project folder
 * and each of its branches sit in the repository and its worktrees: from
 * the worktree that has a branch checked out, files on disk and
 * uncommitted work included, or else from git at its last commit.
 */

/** Git is missing, the folder is outside a repository, or a command failed. */
export class GitError extends Data.TaggedError('GitError')<{
  readonly reason: 'not-a-repo' | 'unknown-ref' | 'command-failed';
  readonly baseDir: string;
  readonly cause: unknown;
}> {}

/** The repository a Project folder lives in, seen from that folder. */
export type Repository = {
  /** The worktree holding the folder, absolute. */
  readonly toplevel: string;
  /** The folder's path inside every worktree: `''` at the top, else `a/b`. */
  readonly prefix: string;
  /** The branch the folder's own worktree has checked out; null when detached. */
  readonly current: string | null;
  readonly worktrees: ReadonlyArray<Checkout>;
};

/** One worktree of the repository, as `git worktree list` names it. */
export type Checkout = {
  readonly root: string;
  readonly head: string;
  readonly branch: string | null;
};

/** Where one branch of a Project is read. */
export type Placement =
  /** On disk, in this folder: the Project folder inside a worktree. */
  | { readonly kind: 'worktree'; readonly folder: string }
  /** From git, at this commit, nothing checked out. */
  | {
      readonly kind: 'commit';
      readonly repository: Repository;
      readonly commit: string;
    };

export interface GitShape {
  /** Runs git in `baseDir`, never throwing: `ok` says whether it succeeded. */
  readonly run: (
    baseDir: string,
    args: readonly string[],
  ) => Promise<{
    readonly stdout: string;
    readonly stderr: string;
    readonly ok: boolean;
  }>;
  /** Runs git in `baseDir` and gives its output, or throws a GitError for `reason`. */
  readonly require: (
    baseDir: string,
    args: readonly string[],
    reason: GitError['reason'],
  ) => Promise<string>;
  /** The fields of git's NUL-separated (`-z`) output. */
  readonly splitNul: (stdout: string) => string[];
  /** The repository of the folder `root`; a GitError `not-a-repo` outside one. */
  readonly locateRepository: (root: string) => Promise<Repository>;
  /**
   * The Project folder inside the worktree that has `branch` checked out:
   * `root` itself for the folder's own worktree; null when no worktree has
   * it, or the one that has it lacks the folder.
   */
  readonly worktreeFolder: (
    repository: Repository,
    root: string,
    branch: string,
  ) => Promise<string | null>;
  /**
   * Where `branch` of the Project at `root` is read: null is `root` as it is
   * on disk; a branch some worktree has checked out is that worktree's copy
   * of the folder; any other commit-ish is read from git. Unknown ones fail
   * as `unknown-ref`, a folder outside git as `not-a-repo`.
   */
  readonly placeBranch: (
    root: string,
    branch: string | null,
  ) => Promise<Placement>;
  /**
   * The local branches of the Project's repository, the current one first
   * then by name, each with the worktree folder it is read from, if any.
   */
  readonly listBranches: (root: string) => Promise<Branches>;
  /**
   * Runs work that asks git, a failure as the RPC contracts say it: a
   * GitError keeps its reason, anything else is `command-failed`.
   */
  readonly attempt: <A>(
    run: () => Promise<A>,
  ) => Effect.Effect<A, GitUnavailableError>;
}

/** Git, as the server's handlers and Snapshots ask it. */
export class Git extends Context.Service<Git, GitShape>()(
  'Monoverse/server/Git',
) {}
