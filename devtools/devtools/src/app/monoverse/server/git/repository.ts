import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Branches } from '../../contract/index.js';
import { GitError, requireGit, runGit } from './run-git.js';

/*
 * Where a Project folder sits in its git repository, and where each of the
 * repository's local branches can be read: from the worktree that has it
 * checked out, files on disk and uncommitted work included, or else from
 * git at its last commit.
 */

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

/** The repository of the folder `root`; a GitError `not-a-repo` outside one. */
export async function locateRepository(root: string): Promise<Repository> {
  const [toplevel = '', prefix = ''] = (
    await requireGit(
      root,
      ['rev-parse', '--show-toplevel', '--show-prefix'],
      'not-a-repo',
    )
  ).split('\n');
  const [head, listing] = await Promise.all([
    runGit(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    requireGit(root, ['worktree', 'list', '--porcelain'], 'command-failed'),
  ]);
  const current = head.ok ? head.stdout.trim() : '';
  return {
    toplevel: toplevel.trim(),
    prefix: prefix.trim().replace(/\/$/, ''),
    current: current === '' ? null : current,
    worktrees: parseWorktreeList(listing),
  };
}

/** Reads `git worktree list --porcelain`; a bare entry has no files to show. */
export function parseWorktreeList(output: string): Checkout[] {
  const checkouts: Checkout[] = [];
  for (const block of output.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    let root: string | null = null;
    let head = '';
    let branch: string | null = null;
    let bare = false;
    for (const line of lines) {
      if (line.startsWith('worktree ')) root = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length);
      else if (line.startsWith('branch '))
        branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (line === 'bare') bare = true;
    }
    if (root === null || bare) continue;
    checkouts.push({ root, head, branch });
  }
  return checkouts;
}

/**
 * The Project folder inside the worktree that has `branch` checked out:
 * `root` itself for the folder's own worktree; null when no worktree has
 * it, or the one that has it lacks the folder.
 */
export async function worktreeFolder(
  repository: Repository,
  root: string,
  branch: string,
): Promise<string | null> {
  const checkout = repository.worktrees.find(
    (worktree) => worktree.branch === branch,
  );
  if (checkout === undefined) return null;
  if (checkout.root === repository.toplevel) return root;
  const folder = join(checkout.root, repository.prefix);
  return (await isDirectory(folder)) ? folder : null;
}

/**
 * Where `branch` of the Project at `root` is read: null is `root` as it is
 * on disk; a branch some worktree has checked out is that worktree's copy
 * of the folder; any other commit-ish is read from git. Unknown ones fail
 * as `unknown-ref`, a folder outside git as `not-a-repo`.
 */
export async function placeBranch(
  root: string,
  branch: string | null,
): Promise<Placement> {
  if (branch === null) return { kind: 'worktree', folder: root };
  if (branch === '' || branch.startsWith('-')) {
    throw new GitError({
      reason: 'unknown-ref',
      baseDir: root,
      cause: `Not a branch: ${branch}`,
    });
  }
  const repository = await locateRepository(root);
  const folder = await worktreeFolder(repository, root, branch);
  if (folder !== null) return { kind: 'worktree', folder };
  const commit = await requireGit(
    root,
    ['rev-parse', '--verify', '--quiet', `${branch}^{commit}`],
    'unknown-ref',
  );
  return { kind: 'commit', repository, commit: commit.trim() };
}

/** Bases Compare-to starts at, in order of preference. */
const preferredBases = ['main', 'master', 'develop'];

/**
 * The local branches of the Project's repository, the current one first
 * then by name, each with the worktree folder it is read from, if any.
 */
export async function listBranches(root: string): Promise<Branches> {
  const repository = await locateRepository(root);
  const names = (
    await requireGit(
      root,
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      'command-failed',
    )
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort((left, right) => left.localeCompare(right));
  const { current } = repository;
  const ordered =
    current !== null && names.includes(current)
      ? [current, ...names.filter((name) => name !== current)]
      : names;
  const branches = await Promise.all(
    ordered.map(async (name) => ({
      name,
      worktree: await worktreeFolder(repository, root, name),
    })),
  );
  const defaultBase =
    preferredBases.find((name) => names.includes(name)) ?? current;
  return { current, defaultBase, branches };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
