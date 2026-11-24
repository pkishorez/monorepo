import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import type { ProjectEntry } from '../../server/rpc/project-registry/contract/index.js';
import { placeOf, projectOf, samePlace } from './selectors.js';
import {
  analysisAt,
  changesAt,
  rootOf,
  type Model,
  type MonoverseShape,
  type Place,
  type State,
} from './shared/index.js';

/** Where a saved project opens. */
const opening = (
  projects: ReadonlyArray<ProjectEntry> | null,
  project: string,
): State => {
  if (projects === null) return { _tag: 'Finding', project };
  const entry = projects.find((one) => one.id === project);
  if (entry === undefined) return { _tag: 'Picking' };
  return { _tag: 'Opening', project, root: entry.path };
};

/** Leaving a project forgets what was read of it. */
const leaving = {
  branches: null,
  gitProblem: null,
  changed: null,
  changesProblem: null,
  file: null,
  folder: null,
  switching: false,
} satisfies Partial<Model>;

const moved = (place: Place) => ({ _tag: 'Moved' as const, ...place });

export const init: InitOf<typeof MonoverseShape> = (place) => ({
  model: {
    projects: null,
    projectsProblem: null,
    package: place.package,
    branch: place.branch,
    base: place.base,
    changes: place.changes,
    deleted: true,
    unchanged: 'dim',
    ignored: true,
    ...leaving,
    reloads: 0,
  },
  state:
    place.project === null
      ? { _tag: 'Picking' }
      : { _tag: 'Finding', project: place.project },
});

export const updates: UpdatesOf<typeof MonoverseShape> = {
  // 1. List
  Listed: ({ projects }, { model, state }) => {
    if (state._tag !== 'Finding')
      return { model: { projects, projectsProblem: null } };
    const next = opening(projects, state.project);
    return {
      model: { projects, projectsProblem: null },
      state: next,
      // A project not saved shows the picker, and the Place says so.
      ...(next._tag === 'Picking'
        ? { emit: moved({ ...placeOf(model, next), package: null }) }
        : {}),
    };
  },
  ListRefused: ({ problem }, { state }) => ({
    model: { projectsProblem: problem },
    ...(state._tag === 'Finding'
      ? { state: { _tag: 'Picking' as const } }
      : {}),
  }),
  // 2. Pick
  SwitchAsked: () => ({ model: { switching: true } }),
  Dismissed: () => ({ model: { switching: false } }),
  Picked: ({ project }, { model, state }) => {
    const projects =
      model.projects?.some((one) => one.id === project.id) === true
        ? model.projects
        : [project, ...(model.projects ?? [])];
    if (projectOf(state) === project.id)
      return { model: { projects, switching: false } };
    // Another project opens at its own current branch and default base.
    const fresh = {
      ...leaving,
      projects,
      package: null,
      branch: null,
      base: null,
    };
    const next = {
      _tag: 'Opening' as const,
      project: project.id,
      root: project.path,
    };
    return {
      model: fresh,
      state: next,
      emit: moved(placeOf({ ...model, ...fresh }, next)),
    };
  },
  // 3. Follow
  Followed: ({ place }, { model, state }) => {
    if (samePlace(place, placeOf(model, state))) return {};
    const where = {
      package: place.package,
      branch: place.branch,
      base: place.base,
      changes: place.changes,
    };
    if (place.project !== projectOf(state))
      return {
        model: { ...leaving, ...where },
        state:
          place.project === null
            ? { _tag: 'Picking' as const }
            : opening(model.projects, place.project),
      };
    return {
      model: {
        ...where,
        ...(place.package === model.package
          ? {}
          : { file: null, folder: null }),
      },
    };
  },
  // 4. Analyse
  Analysed: ({ at, workspace, links, cycles }, { model, state }) => {
    const root = rootOf(state);
    const project = projectOf(state);
    if (root === null || project === null || at !== analysisAt(model))
      return {};
    return {
      state:
        workspace.kind === 'single-package'
          ? { _tag: 'Package', project, root, at, workspace }
          : { _tag: 'Monorepo', project, root, at, workspace, links, cycles },
    };
  },
  AnalyseRefused: ({ at, problem, missing }, { model, state }) => {
    const root = rootOf(state);
    const project = projectOf(state);
    if (root === null || project === null || at !== analysisAt(model))
      return {};
    return {
      state: { _tag: 'Failure', project, root, at, problem, missing },
    };
  },
  Retried: (_, { model, state }) => {
    const reloads = model.reloads + 1;
    if (state._tag === 'Picking' || state._tag === 'Finding')
      return { model: { reloads } };
    return {
      model: { reloads, gitProblem: null, changesProblem: null },
      ...(state._tag === 'Failure'
        ? {
            state: {
              _tag: 'Opening' as const,
              project: state.project,
              root: state.root,
            },
          }
        : {}),
    };
  },
  // 5. Git
  BranchesRead: ({ branches }) => ({
    model: { branches, gitProblem: null },
  }),
  BranchesRefused: ({ problem }) => ({
    model: { branches: null, gitProblem: problem },
  }),
  BranchChosen: ({ branch }, { model, state }) => {
    // The folder's own branch is named as none, so the address stays bare.
    const named = branch === model.branches?.current ? null : branch;
    if (named === model.branch) return {};
    const next = { ...model, branch: named };
    return {
      model: { branch: named },
      emit: moved(placeOf(next, state)),
    };
  },
  BaseChosen: ({ base }, { model, state }) => {
    const named = base === model.branches?.defaultBase ? null : base;
    if (named === model.base) return {};
    const next = { ...model, base: named };
    return { model: { base: named }, emit: moved(placeOf(next, state)) };
  },
  ChangesToggled: (_, { model, state }) => {
    const next = { ...model, changes: !model.changes };
    return {
      model: { changes: next.changes, changesProblem: null },
      emit: moved(placeOf(next, state)),
    };
  },
  DeletedToggled: (_, { model }) => ({ model: { deleted: !model.deleted } }),
  UnchangedChosen: ({ unchanged }) => ({ model: { unchanged } }),
  IgnoredToggled: (_, { model }) => ({ model: { ignored: !model.ignored } }),
  ChangesRead: ({ at, files }, { model, state }) =>
    at === changesAt(model, state)
      ? { model: { changed: { at, files }, changesProblem: null } }
      : {},
  ChangesRefused: ({ at, problem }, { model, state }) =>
    at === changesAt(model, state)
      ? { model: { changesProblem: problem } }
      : {},
  // 6. Enter
  Entered: ({ package: path }, { model, state }) => {
    if (state._tag !== 'Monorepo' || path === model.package) return {};
    const next = { ...model, package: path };
    return {
      model: { package: path, file: null, folder: null },
      emit: moved(placeOf(next, state)),
    };
  },
  Left: (_, { model, state }) => {
    if (model.package === null) return {};
    const next = { ...model, package: null };
    return {
      model: { package: null, file: null, folder: null },
      emit: moved(placeOf(next, state)),
    };
  },
  // 7. View
  FileOpened: ({ path }) => ({ model: { file: path, folder: null } }),
  FileClosed: () => ({ model: { file: null } }),
  FolderViewed: ({ path, files, sourceRoots }, { model, state }) => {
    const folder = { folder: { path, files, sourceRoots }, file: null };
    // The Monorepo's tree knows no Package's files, only what changed.
    const aPackage =
      state._tag === 'Monorepo' &&
      model.package === null &&
      state.workspace.packages.some((one) => one.path === path);
    if (!aPackage || model.changes) return { model: folder };
    const next = { ...model, changes: true };
    return {
      model: { ...folder, changes: true, changesProblem: null },
      emit: moved(placeOf(next, state)),
    };
  },
  FolderClosed: () => ({ model: { folder: null } }),
};
