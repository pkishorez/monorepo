import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

/*
 * Which branch a dev run is, as Portless names it. Portless puts a prefix
 * in front of a host only in a linked git worktree (the last part of its
 * branch, made host-safe), so the main checkout is always `main`, and the
 * prefix names a worktree's own folders, Connection and Cloud Connect.
 * `git worktree list` gives every branch that still has a checkout, named
 * the same way.
 */

/** A dev run's branch: its folder slug, and its Cloud Connect's URL. */
export interface Branch {
  readonly slug: string;
  readonly cloud: string;
}

const NAME = 'connect.kishore';

/** The longest a DNS label may be, as Portless cuts a prefix to. */
const LABEL = 63;

/** The branch `url`, Portless's URL for `name`, belongs to; throws when it is not one of `name`'s. */
export const slugOf = (url: string, name: string = NAME): string => {
  const { hostname } = new URL(url);
  const at = hostname.indexOf(`${name}.`);
  if (at === -1 || hostname.slice(at + name.length + 1).includes('.'))
    throw new Error(`${url} is not a Portless URL for ${name}`);
  return at === 0 ? 'main' : hostname.slice(0, at - 1);
};

/** The branch the checkout at `cwd` is, asking Portless for Cloud Connect's URL there. */
export const branchOf = async (cwd: string): Promise<Branch> => {
  const { stdout } = await promisify(execFile)('portless', ['get', NAME], {
    cwd,
  });
  const cloud = stdout.trim();
  return { slug: slugOf(cloud), cloud };
};

/** The slug Portless gives a linked worktree on the git branch `branch`: `main` for main, master or none. */
export const prefixOf = (branch: string | null): string => {
  if (branch === null || branch === 'main' || branch === 'master')
    return 'main';
  const label = (branch.split('/').pop() ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (label === '') return 'main';
  if (label.length <= LABEL) return label;
  const hash = createHash('sha256').update(label).digest('hex').slice(0, 6);
  return `${label.slice(0, LABEL - 7).replace(/-+$/, '')}-${hash}`;
};

/**
 * The slug of every checkout `git worktree list --porcelain` printed whose
 * folder is still there: the first, the main checkout, is `main`.
 */
export const slugsOf = (
  porcelain: string,
  exists: (path: string) => boolean = existsSync,
): ReadonlySet<string> => {
  const slugs = new Set<string>();
  const entries = porcelain.split(/\n\s*\n/).filter((each) => each.trim());
  entries.forEach((entry, index) => {
    const lines = entry.split('\n');
    const path = lines
      .find((line) => line.startsWith('worktree '))
      ?.slice('worktree '.length);
    if (path === undefined) return;
    if (lines.some((line) => line.startsWith('prunable')) || !exists(path))
      return;
    const branch =
      lines
        .find((line) => line.startsWith('branch refs/heads/'))
        ?.slice('branch refs/heads/'.length) ?? null;
    slugs.add(index === 0 ? 'main' : prefixOf(branch));
  });
  return slugs;
};

/** The slug of every branch with a checkout of the repository at `cwd`. */
export const worktreeSlugs = async (
  cwd: string,
): Promise<ReadonlySet<string>> => {
  const { stdout } = await promisify(execFile)(
    'git',
    ['worktree', 'list', '--porcelain'],
    { cwd },
  );
  return slugsOf(stdout);
};
