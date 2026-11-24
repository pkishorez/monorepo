import { Context, type Effect } from 'effect';

import type {
  GitUnavailableError,
  InvalidRootError,
} from '../../../rpc/project/contract/index.js';

/**
 * A Project folder as one branch has it: which files git knows there and
 * what each holds. Every path is relative to the Project folder,
 * `/`-separated. Everything Monoverse reads of a Project goes through one,
 * so the same analysis runs on a worktree's files and on a commit alike.
 */
export interface Snapshot {
  /** The Project folder, absolute, as it was asked for. */
  readonly root: string;
  /** Where the files come from. */
  readonly source:
    | {
        /** A folder on disk: the Project folder inside a worktree. */
        readonly kind: 'disk';
        readonly folder: string;
      }
    | {
        /** A commit, read from git without checking it out. */
        readonly kind: 'git';
        readonly commit: string;
      };
  /**
   * Every file git knows under `folder` (`''` is the whole Project), sorted:
   * on disk, tracked or new and not ignored; from git, every file of the
   * commit. A folder it lacks has none.
   */
  readonly list: (folder: string) => Promise<ReadonlyArray<string>>;
  /** One file's bytes; undefined when there is no such file. */
  readonly read: (path: string) => Promise<Uint8Array | undefined>;
  /** Many files' bytes at once; a file it lacks is left out. */
  readonly readMany: (
    paths: ReadonlyArray<string>,
  ) => Promise<ReadonlyMap<string, Uint8Array>>;
  /**
   * A folder on disk holding these files at the paths `list` gives, for
   * what reads the disk itself, such as @kestack/monoverse: on disk, the
   * folder itself; from git, the Project folder in a copy of the whole
   * commit, so what sits above it is there too, written once and kept
   * for later opens, each Package's node_modules linked to the
   * checkout's.
   */
  readonly onDisk: () => Promise<string>;
}

export interface SnapshotsShape {
  /**
   * The Project folder `root` at `branch`: null is the folder as it is on
   * disk; a branch some worktree has checked out is that worktree's copy of
   * the folder, uncommitted work included; any other is read from git at its
   * last commit.
   */
  readonly open: (
    root: string,
    branch: string | null,
  ) => Effect.Effect<Snapshot, InvalidRootError | GitUnavailableError>;
  /**
   * The folder Monoverse opened, as an absolute path that exists and is a
   * folder; `~` is expanded. Every request names it, since several Worktrees
   * of one Project may be open at once.
   */
  readonly existingRoot: (
    root: string,
  ) => Effect.Effect<string, InvalidRootError>;
}

/** A Project folder at a branch, as the server's handlers read it. */
export class Snapshots extends Context.Service<Snapshots, SnapshotsShape>()(
  'Monoverse/server/Snapshots',
) {}
