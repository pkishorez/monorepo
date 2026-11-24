import type { DataOf } from '@kestack/kabuki/types';

import type { Branches } from '../../../../../../server/rpc/git/contract/index.js';
import type { ProjectShape } from '../index.js';

type Data = DataOf<typeof ProjectShape>;

/** The branch shown, by name: the one named, else the folder's own. */
export const branchOf = ({ model, props }: Data): string | null =>
  props.branch ?? model.branches?.current ?? null;

/** The branch compared to, by name: the one named, else the default. */
export const baseOf = ({ model, props }: Data): string | null =>
  props.base ?? model.branches?.defaultBase ?? null;

/** What an analysis is keyed by: the branch named, and the reloads. */
export const analysisAt = ({ model, props }: Data) =>
  JSON.stringify([props.branch, model.reloads]);

/** Whether the project on screen is being analysed again, at another branch. */
export const isRereading = (data: Data): boolean =>
  (data.state._tag === 'Monorepo' || data.state._tag === 'Package') &&
  data.state.at !== analysisAt(data);

/** What a change set is keyed by; null while Changes cannot be shown. */
export const changesAt = (data: Data): string | null => {
  const { model, props, state } = data;
  const base = baseOf(data);
  if (!props.changes || base === null) return null;
  if (state._tag !== 'Monorepo' && state._tag !== 'Package') return null;
  const blocked = changesBlocked({
    branches: model.branches,
    problem: model.gitProblem,
    branch: branchOf(data),
    base,
  });
  if (blocked !== null) return null;
  return JSON.stringify([model.root, props.branch, base, model.reloads]);
};

/** What the tree is coloured with: the change set read at the branch shown, if any. */
export const changesOf = (data: Data) => {
  const at = changesAt(data);
  const { changed } = data.model;
  return at !== null && changed?.at === at ? changed.files : null;
};

/** What the tree is coloured with, the deleted files left out unless they are drawn. */
export const shownChangesOf = (data: Data) => {
  const changes = changesOf(data);
  return changes === null || data.props.deleted
    ? changes
    : changes.filter(({ status }) => status !== 'deleted');
};

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
