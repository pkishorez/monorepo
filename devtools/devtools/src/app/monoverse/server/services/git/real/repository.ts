import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Branches, Worktree } from '../../../rpc/git/contract/index.js';
import {
  GitError,
  type Checkout,
  type Placement,
  type Repository,
} from '../contract/index.js';
import { requireGit, runGit } from './run-git.js';

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

export function parseWorktreeList(output: string): Checkout[] {
  const checkouts: Checkout[] = [];
  let first = true;
  for (const block of output.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    const primary = first;
    first = false;
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
    checkouts.push({ root, head, branch, primary });
  }
  return checkouts;
}

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

const preferredBases = ['main', 'master', 'develop'];

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

export async function listWorktrees(
  root: string,
): Promise<ReadonlyArray<Worktree>> {
  const repository = await locateRepository(root);
  const worktrees = await Promise.all(
    repository.worktrees.map(async (checkout) => {
      const current = checkout.root === repository.toplevel;
      const folder = current ? root : join(checkout.root, repository.prefix);
      return current || (await isDirectory(folder))
        ? [
            {
              folder,
              branch: checkout.branch,
              head: checkout.head,
              primary: checkout.primary,
              current,
            },
          ]
        : [];
    }),
  );
  return worktrees.flat();
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
