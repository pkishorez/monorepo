import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { Effect } from 'effect';
import type { Worktree, WorktreeResolution } from '../../rpc/index.js';

/**
 * Answers which Worktrees the repository of one folder has, and where the
 * Worktree sibling of that folder is in each. When the folder itself is gone,
 * the nearest existing parent finds the repository, so a pruned checkout still
 * offers its siblings. A folder outside git resolves to `null`, never an error.
 */
export function resolveWorktrees(
  path: string,
): Effect.Effect<WorktreeResolution | null> {
  return Effect.promise(() => resolveWorktreesAsync(path));
}

async function resolveWorktreesAsync(
  path: string,
): Promise<WorktreeResolution | null> {
  const expanded = expandHome(path);
  if (!isAbsolute(expanded)) return null;
  const folder = resolve(expanded);

  const anchor = await nearestExistingFolder(folder);
  if (anchor === null) return null;

  const toplevel = await runGit(anchor, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) return null;
  const currentRoot = toplevel.trim();
  if (currentRoot.length === 0) return null;

  const repositoryPath = relative(currentRoot, folder);
  if (repositoryPath.startsWith('..')) return null;

  const listing = await runGit(currentRoot, [
    'worktree',
    'list',
    '--porcelain',
  ]);
  if (listing === null) return null;

  const checkouts = parseWorktreeList(listing);
  const worktrees: Worktree[] = await Promise.all(
    checkouts.map(async (checkout, index) => {
      const siblingPath = join(checkout.root, repositoryPath);
      return {
        root: checkout.root,
        branch: checkout.branch,
        head: checkout.head,
        primary: index === 0,
        siblingPath,
        present: await isDirectory(siblingPath),
      };
    }),
  );

  const current =
    worktrees.find((worktree) => worktree.root === currentRoot)?.root ?? null;
  return { repositoryPath, current, worktrees };
}

type Checkout = {
  readonly root: string;
  readonly head: string;
  readonly branch: string | null;
};

/** Reads `git worktree list --porcelain`; bare entries have no files to show. */
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

async function nearestExistingFolder(folder: string): Promise<string | null> {
  let candidate = folder;
  for (;;) {
    if (await isDirectory(candidate)) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function runGit(cwd: string, args: readonly string[]): Promise<string | null> {
  return new Promise((done) => {
    execFile(
      'git',
      [...args],
      { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => done(error === null ? stdout : null),
    );
  });
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}
