import type { Branches } from '../../../server/rpc/git/contract/index.js';
import type { Model, State } from './shape.js';

/** The project's folder, in any State that has one. */
export const rootOf = (state: State): string | null =>
  'root' in state ? state.root : null;

/** The branch shown, by name: the one named, else the folder's own. */
export const branchOf = (model: Model): string | null =>
  model.branch ?? model.branches?.current ?? null;

/** The branch compared to, by name: the one named, else the default. */
export const baseOf = (model: Model): string | null =>
  model.base ?? model.branches?.defaultBase ?? null;

/** What an analysis is keyed by: the branch named, and the reloads. */
export const analysisAt = (model: Model) =>
  JSON.stringify([model.branch, model.reloads]);

/** Whether the project on screen is being analysed again, at another branch. */
export const isRereading = (model: Model, state: State): boolean =>
  (state._tag === 'Monorepo' || state._tag === 'Package') &&
  state.at !== analysisAt(model);

/** What a change set is keyed by; null while Changes cannot be shown. */
export const changesAt = (model: Model, state: State): string | null => {
  const root = rootOf(state);
  const base = baseOf(model);
  if (!model.changes || root === null || base === null) return null;
  if (state._tag !== 'Monorepo' && state._tag !== 'Package') return null;
  const blocked = changesBlocked({
    branches: model.branches,
    problem: model.gitProblem,
    branch: branchOf(model),
    base,
  });
  if (blocked !== null) return null;
  return JSON.stringify([root, model.branch, base, model.reloads]);
};

/** What the tree is coloured with: the change set read at the Place shown, if any. */
export const changesOf = (model: Model, state: State) => {
  const at = changesAt(model, state);
  return at !== null && model.changed?.at === at ? model.changed.files : null;
};

/** What the tree is coloured with, the deleted files left out unless they are drawn. */
export const shownChangesOf = (model: Model, state: State) => {
  const changes = changesOf(model, state);
  return changes === null || model.deleted
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
