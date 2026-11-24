import type {
  ChangedPath,
  ChangeSet,
  ChangeStatus,
  DiffHunk,
} from '../contract/index.js';
import {
  GitError,
  type GitShape,
  type Placement,
} from '../../../services/git/contract/index.js';
import { parsePatch } from './parse-patch.js';

/*
 * What a branch changed since it left another, in the Project folder:
 * from the merge-base of the two to the branch's last commit when it is
 * read from git, or to its worktree's files, uncommitted work included,
 * when one has it checked out. Paths are relative to the Project folder.
 */

const wholeFileContext = 1_000_000;

/**
 * The change set of the branch placed at `placement` since `base`. `root`
 * is the Project folder git runs in when the branch is read from git.
 */
export async function readChangeSet(
  git: GitShape,
  root: string,
  placement: Placement,
  base: string,
): Promise<ChangeSet> {
  if (placement.kind === 'commit') {
    const mergeBase = await mergeBaseOf(git, root, base, placement.commit);
    const files = (
      await nameStatus(git, root, [mergeBase, placement.commit])
    ).map(([path, status]) => ({ path, status }));
    return { baseRef: mergeBase, files: sorted(files) };
  }

  const folder = placement.folder;
  await git.require(folder, ['rev-parse', '--show-toplevel'], 'not-a-repo');
  const mergeBase = await mergeBaseOf(git, folder, base, 'HEAD');
  const changed = new Map<string, ChangeStatus>();

  // Committed work between the merge-base and HEAD.
  for (const [path, status] of await nameStatus(git, folder, [
    mergeBase,
    'HEAD',
  ])) {
    record(changed, path, status);
  }
  // Uncommitted work: the working tree against HEAD, plus untracked files.
  for (const [path, status] of await nameStatus(git, folder, ['HEAD'])) {
    record(changed, path, status);
  }
  const untracked = git.splitNul(
    await git.require(
      folder,
      ['ls-files', '--others', '--exclude-standard', '-z'],
      'command-failed',
    ),
  );
  for (const path of untracked) record(changed, path, 'added');

  const files = [...changed].map(([path, status]) => ({ path, status }));
  return { baseRef: mergeBase, files: sorted(files) };
}

/** How one file changed on the branch placed at `placement` since `base`. */
export async function readFileDiff(
  git: GitShape,
  root: string,
  placement: Placement,
  base: string,
  path: string,
): Promise<ReadonlyArray<DiffHunk>> {
  const unified = `--unified=${wholeFileContext}`;
  if (placement.kind === 'commit') {
    const mergeBase = await mergeBaseOf(git, root, base, placement.commit);
    return parsePatch(
      await git.require(
        root,
        [
          'diff',
          '--no-renames',
          '--no-color',
          unified,
          mergeBase,
          placement.commit,
          '--',
          path,
        ],
        'command-failed',
      ),
    );
  }

  const folder = placement.folder;
  const mergeBase = await mergeBaseOf(git, folder, base, 'HEAD');
  const tracked = await git.run(folder, [
    'ls-files',
    '--error-unmatch',
    '--',
    path,
  ]);
  // An untracked file has no diff against the merge-base: it is all new.
  const patch = tracked.ok
    ? await git.require(
        folder,
        // Full context so one hunk carries the complete before and after file.
        ['diff', '--no-renames', '--no-color', unified, mergeBase, '--', path],
        'command-failed',
      )
    : (
        await git.run(folder, [
          'diff',
          '--no-index',
          '--no-color',
          unified,
          '--',
          '/dev/null',
          path,
        ])
      ).stdout;
  return parsePatch(patch);
}

async function mergeBaseOf(
  git: GitShape,
  cwd: string,
  base: string,
  tip: string,
): Promise<string> {
  // Never read as an option.
  if (base === '' || base.startsWith('-')) {
    throw new GitError({
      reason: 'unknown-ref',
      baseDir: cwd,
      cause: `Not a branch: ${base}`,
    });
  }
  const mergeBase = await git.require(
    cwd,
    ['merge-base', base, tip],
    'unknown-ref',
  );
  return mergeBase.trim();
}

async function nameStatus(
  git: GitShape,
  cwd: string,
  revisions: ReadonlyArray<string>,
): Promise<ReadonlyArray<readonly [string, ChangeStatus]>> {
  const output = git.splitNul(
    await git.require(
      cwd,
      [
        'diff',
        '--name-status',
        '--no-renames',
        '-z',
        '--relative',
        ...revisions,
      ],
      'command-failed',
    ),
  );
  const entries: Array<readonly [string, ChangeStatus]> = [];
  for (let index = 0; index + 1 < output.length; index += 2) {
    const status = trackedStatus(output[index] ?? '');
    const path = output[index + 1];
    if (status !== undefined && path !== undefined)
      entries.push([path, status]);
  }
  return entries;
}

// A path added since the merge-base stays added, however it changed after.
function record(
  changed: Map<string, ChangeStatus>,
  path: string,
  status: ChangeStatus,
): void {
  const current = changed.get(path);
  // Added since the merge-base, then deleted: it never touched the merge-base.
  if (current === 'added' && status === 'deleted') {
    changed.delete(path);
    return;
  }
  changed.set(
    path,
    current === 'deleted' && status === 'added'
      ? 'modified'
      : current === 'added' || status === 'added'
        ? 'added'
        : current === 'deleted' || status === 'deleted'
          ? 'deleted'
          : status,
  );
}

function sorted(files: Array<ChangedPath>): Array<ChangedPath> {
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function trackedStatus(code: string): ChangeStatus | undefined {
  switch (code.charAt(0)) {
    case 'A':
      return 'added';
    case 'M':
    case 'T':
    case 'U':
      return 'modified';
    case 'D':
      return 'deleted';
    default:
      return undefined;
  }
}
