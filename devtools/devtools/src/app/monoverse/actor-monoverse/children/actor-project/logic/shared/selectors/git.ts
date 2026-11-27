import type { DataOf } from '@kestack/kabuki/types';

import {
  uncommittedBase,
  type Branches,
} from '../../../../../../server/rpc/git/contract/index.js';
import type { ProjectShape } from '../index.js';

type Data = DataOf<typeof ProjectShape>;

export const branchOf = ({ model, props }: Data): string | null =>
  props.branch ?? model.branches?.current ?? null;

export const baseOf = ({ model, props }: Data): string | null =>
  props.base ?? model.branches?.defaultBase ?? null;

export const analysisAt = ({ model, props }: Data) =>
  JSON.stringify([props.branch, model.reloads]);

export const isRereading = (data: Data): boolean =>
  (data.state._tag === 'Monorepo' || data.state._tag === 'Package') &&
  data.state.at !== analysisAt(data);

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

export const changesOf = (data: Data) => {
  const at = changesAt(data);
  const { changed } = data.model;
  return at !== null && changed?.at === at ? changed.files : null;
};

export const shownChangesOf = (data: Data) => {
  const changes = changesOf(data);
  return changes === null || data.props.deleted
    ? changes
    : changes.filter(({ status }) => status !== 'deleted');
};

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
  if (
    base === uncommittedBase &&
    branch !== null &&
    !isCheckedOut(branches, branch)
  )
    return `${branch} is not checked out, so it has nothing uncommitted.`;
  return null;
}

const isCheckedOut = (branches: Branches, branch: string): boolean =>
  branches.branches.some(
    ({ name, worktree }) => name === branch && worktree !== null,
  );
