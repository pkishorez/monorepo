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
}

/** One file's text; undefined when there is no such file. */
export async function readText(
  snapshot: Snapshot,
  path: string,
): Promise<string | undefined> {
  const bytes = await snapshot.read(path);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

/** `path` inside `folder`, both root-relative, as one root-relative path. */
export function joinPath(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}
