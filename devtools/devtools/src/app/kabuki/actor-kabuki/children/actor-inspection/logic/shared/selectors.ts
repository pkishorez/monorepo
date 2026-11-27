import type { DataOf } from '@kestack/kabuki/types';
import type { InspectionShape, Project, Run, Worktree } from './shape.js';

export const tabOf = ({ props }: DataOf<typeof InspectionShape>) =>
  props?.tab ?? 'inspector';

export const storyShown = (data: DataOf<typeof InspectionShape>) =>
  tabOf(data) === 'story';

export const busyOf = (pending: unknown, problem: string | null, run: Run) =>
  (pending !== null && problem === null) || run.status === 'running';

export const failureOf = (
  pending: unknown,
  problem: string | null,
  run: Run,
) => {
  if (problem !== null) return problem;
  if (pending !== null) return null;
  if (run.status === 'failed')
    return run.reason ?? 'The Agent could not answer.';
  if (run.status === 'cancelled') return 'Stopped before it answered.';
  return null;
};

const lastOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;

export const projectOf = (
  project: string,
  projects: ReadonlyArray<Project> | null,
): Project =>
  projects?.find(({ path }) => path === project) ?? {
    name: lastOf(project),
    path: project,
  };

export const projectsOf = (
  project: string,
  projects: ReadonlyArray<Project> | null,
) => {
  const chosen = projectOf(project, projects);
  const known = projects ?? [];
  return known.some(({ path }) => path === chosen.path)
    ? known
    : [chosen, ...known];
};

const SHORT = 7;

const labelOf = ({ branch, head }: Worktree) =>
  branch ?? `detached @${head.slice(0, SHORT)}`;

export const worktreeOf = (
  folder: string,
  worktrees: ReadonlyArray<Worktree> | null,
) => {
  const known = worktrees?.find((worktree) => worktree.folder === folder);
  return known === undefined ? lastOf(folder) : labelOf(known);
};

export const worktreesOf = (
  folder: string,
  worktrees: ReadonlyArray<Worktree> | null,
) => {
  const known = [...(worktrees ?? [])]
    .sort((left, right) => Number(right.primary) - Number(left.primary))
    .map((worktree) => ({ folder: worktree.folder, label: labelOf(worktree) }));
  return known.some((one) => one.folder === folder)
    ? known
    : [{ folder, label: lastOf(folder) }, ...known];
};
