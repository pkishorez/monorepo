import type { DataOf } from '@kestack/kabuki/types';

import type { Model, MonoverseShape, Place, State } from './shared/index.js';

/** The saved project open, in any State that names one. */
export const projectOf = (state: State): string | null =>
  'project' in state ? state.project : null;

/** The Place shown. */
export const placeOf = (model: Model, state: State): Place => ({
  project: projectOf(state),
  package: model.package,
  branch: model.branch,
  base: model.base,
  changes: model.changes,
});

export const samePlace = (a: Place, b: Place) =>
  a.project === b.project &&
  a.package === b.package &&
  a.branch === b.branch &&
  a.base === b.base &&
  a.changes === b.changes;

// 2. Pick: the whole page with no project, or over an open one.

/** Whether the picker is open. */
export const isPicking = ({ model, state }: DataOf<typeof MonoverseShape>) =>
  state._tag === 'Picking' || model.switching;

/** Where the picker is: the page, or a dialog over the project. */
export const pickerKey = ({ state }: DataOf<typeof MonoverseShape>) =>
  state._tag === 'Picking' ? 'page' : 'dialog';

// 3. Show

/** The Project's Props: the name it was saved by, where in it the Place is, and how its trees are drawn. */
export const projectProps = ({
  model,
  state,
}: DataOf<typeof MonoverseShape, 'Showing'>) => ({
  name: model.projects?.find((one) => one.id === state.project)?.name ?? null,
  package: model.package,
  branch: model.branch,
  base: model.base,
  changes: model.changes,
  deleted: model.deleted,
  unchanged: model.unchanged,
  ignored: model.ignored,
});
