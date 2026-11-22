import type { Branches } from '../contract/index.js';

/**
 * Why Changes cannot be on now, if it cannot: no git, the branches still
 * being read, or the branch shown being the one it is compared to.
 */
export function changesBlocked({
  branches,
  problem,
  branch,
  base,
}: {
  readonly branches: Branches | null;
  readonly problem: string | null;
  readonly branch: string | null;
  readonly base: string | null;
}): string | null {
  if (problem !== null) return problem;
  if (branches === null) return 'Reading the branches…';
  if (base === null) return 'Choose a branch to compare to.';
  if (branch === base)
    return `${branch} is the branch compared to: choose another to see changes.`;
  return null;
}
