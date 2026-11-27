import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import type { ProjectEntry } from '../../server/rpc/projects/contract/index.js';
import { placeOf, projectOf, samePlace } from './selectors.js';
import type { MonoverseShape, Place, State } from './shared/index.js';

const opening = (
  projects: ReadonlyArray<ProjectEntry> | null,
  project: string,
): State => {
  if (projects === null) return { _tag: 'Finding', project };
  const entry = projects.find((one) => one.id === project);
  if (entry === undefined) return { _tag: 'Picking' };
  return { _tag: 'Showing', project, root: entry.path };
};

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
    switching: false,
  },
  state:
    place.project === null
      ? { _tag: 'Picking' }
      : { _tag: 'Finding', project: place.project },
});

export const updates: UpdatesOf<typeof MonoverseShape> = {
  Listed: ({ projects }, { model, state }) => {
    if (state._tag !== 'Finding')
      return { model: { projects, projectsProblem: null } };
    const next = opening(projects, state.project);
    return {
      model: { projects, projectsProblem: null },
      state: next,
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
  SwitchAsked: () => ({ model: { switching: true } }),
  Dismissed: () => ({ model: { switching: false } }),
  Picked: ({ project }, { model, state }) => {
    const projects =
      model.projects?.some((one) => one.id === project.id) === true
        ? model.projects
        : [project, ...(model.projects ?? [])];
    if (projectOf(state) === project.id)
      return { model: { projects, switching: false } };
    const fresh = {
      projects,
      package: null,
      branch: null,
      base: null,
      switching: false,
    };
    const next = {
      _tag: 'Showing' as const,
      project: project.id,
      root: project.path,
    };
    return {
      model: fresh,
      state: next,
      emit: moved(placeOf({ ...model, ...fresh }, next)),
    };
  },
  Moved: ({ package: path, branch, base, changes }, { model, state }) => {
    const where = { package: path, branch, base, changes };
    return {
      model: where,
      emit: moved(placeOf({ ...model, ...where }, state)),
    };
  },
  DeletedToggled: (_, { model }) => ({ model: { deleted: !model.deleted } }),
  UnchangedChosen: ({ unchanged }) => ({ model: { unchanged } }),
  IgnoredToggled: (_, { model }) => ({ model: { ignored: !model.ignored } }),
  Followed: ({ place }, { model, state }) => {
    if (samePlace(place, placeOf(model, state))) return {};
    const where = {
      package: place.package,
      branch: place.branch,
      base: place.base,
      changes: place.changes,
    };
    if (place.project === projectOf(state)) return { model: where };
    return {
      model: { ...where, switching: false },
      state:
        place.project === null
          ? { _tag: 'Picking' as const }
          : opening(model.projects, place.project),
    };
  },
};
