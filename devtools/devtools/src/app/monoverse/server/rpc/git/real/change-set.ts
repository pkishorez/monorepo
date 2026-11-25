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

const wholeFileContext = 1_000_000;

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

  for (const [path, status] of await nameStatus(git, folder, [
    mergeBase,
    'HEAD',
  ])) {
    record(changed, path, status);
  }
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
  const patch = tracked.ok
    ? await git.require(
        folder,
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

function record(
  changed: Map<string, ChangeStatus>,
  path: string,
  status: ChangeStatus,
): void {
  const current = changed.get(path);
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
