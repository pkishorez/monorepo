import { Context, Data, type Effect } from 'effect';

/*
 * Git, as the engine uses it: a Project's branches and Worktrees, a
 * Session's branch, and the few changes a start or a Title makes. Git
 * missing or failing reads as "not git" everywhere: a question answers
 * null, and a fetch is dropped. Only a change fails, with GitError, which a
 * start refuses on. The implementation is services/git/, the only code
 * that runs git.
 */

/** What every branch a Session's new Worktree is made on starts with. */
export const BRANCH_PREFIX = 'ke-code/';

/** A git command that failed, with what git said. */
export class GitError extends Data.TaggedError('GitError')<{
  readonly message: string;
}> {}

/** One working copy of a repository, on a branch or on none. */
export interface Worktree {
  readonly path: string;
  readonly branch: string | null;
}

/** A local branch, the Origin branch it tracks, and the Worktree it is out in. */
export interface LocalBranch {
  readonly name: string;
  /** As `origin/main`; null when it tracks none. */
  readonly upstream: string | null;
  readonly worktree: string | null;
}

/** A branch git made just now, and the commit it was made on. */
export interface MadeBranch {
  readonly name: string;
  readonly at: string;
}

/** A repository's branches, as seen from one of its Worktrees. */
export interface GitBranches {
  /** The branch the Worktree asked from is on; null when on none. */
  readonly current: string | null;
  /** Every Worktree, the one asked from first. */
  readonly worktrees: ReadonlyArray<Worktree>;
  readonly local: ReadonlyArray<LocalBranch>;
  /** Every Origin branch, as `origin/main`. */
  readonly origin: ReadonlyArray<string>;
}

export class Git extends Context.Service<
  Git,
  {
    /**
     * The branches of the repository whose Worktree is the folder `path`
     * itself; null when it is not one, or git is missing or fails.
     */
    readonly branches: (path: string) => Effect.Effect<GitBranches | null>;
    /** The branch the Worktree at `path` is on; null when on none, or not one. */
    readonly branchAt: (path: string) => Effect.Effect<string | null>;
    /**
     * Starts one fetch from Origin at `path` in the background, unless one
     * runs there already, and returns at once.
     */
    readonly fetch: (path: string) => Effect.Effect<void>;
    /**
     * Switches the Worktree at `path` to `branch`. An Origin branch,
     * `origin/x`, switches to the local `x`, made first to track it; the
     * local branch it made, if any.
     */
    readonly switchTo: (
      path: string,
      branch: string,
    ) => Effect.Effect<{ readonly made: MadeBranch | null }, GitError>;
    /** Makes a Worktree at `at`, on the new branch `branch` from `from`. */
    readonly addWorktree: (
      path: string,
      worktree: {
        readonly at: string;
        readonly branch: string;
        readonly from: string;
      },
    ) => Effect.Effect<MadeBranch, GitError>;
    /** Removes the Worktree at `at`, whatever of it is there; never fails. */
    readonly removeWorktree: (path: string, at: string) => Effect.Effect<void>;
    /**
     * Deletes a branch made here, only while it is out in no Worktree and
     * still where it was made; never fails.
     */
    readonly dropBranch: (
      path: string,
      branch: MadeBranch,
    ) => Effect.Effect<void>;
    /**
     * Whether `branch` was pushed: it tracks a branch, or Origin has one of
     * its name. True when git cannot say, so nothing is renamed.
     */
    readonly pushed: (path: string, branch: string) => Effect.Effect<boolean>;
    /**
     * Renames `from` to `to`, or `to-2`, `to-3` and on when that is taken;
     * the name it got.
     */
    readonly rename: (
      path: string,
      from: string,
      to: string,
    ) => Effect.Effect<string, GitError>;
    /** Starts a repository in `path`; why it failed, or null when it did. */
    readonly init: (path: string) => Effect.Effect<string | null>;
  }
>()('@kestack/connect/engine/Git') {}
