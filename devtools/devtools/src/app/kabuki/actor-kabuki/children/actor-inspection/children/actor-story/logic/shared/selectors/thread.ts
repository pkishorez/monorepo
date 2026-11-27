import type { DataOf } from '@kestack/kabuki/types';
import type { StoryShape, Worktree } from '../index.js';
import { titleOf } from './turns.js';

type Data = DataOf<typeof StoryShape>;

export const threadsOf = ({ model }: Data) => {
  const listed = model.threads.map(({ id, title }) => ({
    id,
    title: id === model.thread ? titleOf(model.turns) || title : title,
  }));
  return model.thread === null || listed.some(({ id }) => id === model.thread)
    ? listed
    : [{ id: model.thread, title: titleOf(model.turns) }, ...listed];
};

export const busyOf = ({ model }: Data) =>
  (model.pending !== null && model.problem === null) ||
  model.run.status === 'running';

const lastOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;

export const projectOf = ({
  state,
  model,
}: DataOf<typeof StoryShape, 'Open'>) =>
  model.projects?.find(({ path }) => path === state.project) ?? {
    name: lastOf(state.project),
    path: state.project,
  };

const SHORT = 7;

const labelOf = ({ branch, head }: Worktree) =>
  branch ?? `detached @${head.slice(0, SHORT)}`;

export const worktreesOf = ({
  state,
  model,
}: DataOf<typeof StoryShape, 'Open'>) => {
  const known = [...(model.worktrees ?? [])]
    .sort((left, right) => Number(right.primary) - Number(left.primary))
    .map((worktree) => ({ folder: worktree.folder, label: labelOf(worktree) }));
  return known.some(({ folder }) => folder === state.folder)
    ? known
    : [{ folder: state.folder, label: lastOf(state.folder) }, ...known];
};

export const failureOf = ({ model }: Data) => {
  if (model.problem !== null) return model.problem;
  if (model.pending !== null) return null;
  if (model.run.status === 'failed')
    return model.run.reason ?? 'The Agent could not answer.';
  if (model.run.status === 'cancelled') return 'Stopped before it answered.';
  return null;
};

export const projectsOf = (data: DataOf<typeof StoryShape, 'Open'>) => {
  const projects = data.model.projects ?? [];
  const project = projectOf(data);
  return projects.some(({ path }) => path === project.path)
    ? projects
    : [project, ...projects];
};
