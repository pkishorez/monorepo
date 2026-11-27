import type { DataOf } from '@kestack/kabuki/types';

import type { Model, MonoverseShape, Place, State } from './shared/index.js';

export const projectOf = (state: State): string | null =>
  'project' in state ? state.project : null;

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

export const isPicking = ({ model, state }: DataOf<typeof MonoverseShape>) =>
  state._tag === 'Picking' || model.switching;

export const pickerKey = ({ state }: DataOf<typeof MonoverseShape>) =>
  state._tag === 'Picking' ? 'page' : 'dialog';

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
  shown: model.shown,
  outside: model.outside,
});
