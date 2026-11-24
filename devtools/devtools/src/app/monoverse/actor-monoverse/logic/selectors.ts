import type { DataOf } from '@kestack/kabuki/types';

import { isWithin } from '../../server/rpc/contract/index.js';
import {
  baseOf,
  changesAt,
  changesOf,
  rootOf,
  shownChangesOf,
  type Model,
  type MonoverseShape,
  type Place,
  type State,
} from './shared/index.js';

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

/** Whether what is open waits on the change set, still being read. */
export const awaitingChanges = (model: Model, state: State) =>
  changesAt(model, state) !== null &&
  changesOf(model, state) === null &&
  model.changesProblem === null;

/** The open project's name: as it was saved, else its workspace's. */
const nameIn = (
  model: Model,
  state: DataOf<typeof MonoverseShape, 'Monorepo' | 'Package'>['state'],
) =>
  model.projects?.find((one) => one.id === state.project)?.name ??
  state.workspace.name;

// 2. Pick: the whole page with no project, or over an open one.

/** Whether the picker is open. */
export const isPicking = ({ model, state }: DataOf<typeof MonoverseShape>) =>
  state._tag === 'Picking' || model.switching;

/** Where the picker is: the page, or a dialog over the project. */
export const pickerKey = ({ state }: DataOf<typeof MonoverseShape>) =>
  state._tag === 'Picking' ? 'page' : 'dialog';

// 4. Analyse, 6. Enter

/** The Monorepo's Props: its tree, the Package entered, and how they are drawn. */
export const monorepoProps = ({
  model,
  state,
}: DataOf<typeof MonoverseShape, 'Monorepo'>) => ({
  root: state.root,
  name: nameIn(model, state),
  branch: model.branch,
  workspace: state.workspace,
  links: state.links,
  cycles: state.cycles,
  package: model.package,
  changes: shownChangesOf(model, state),
  unchanged: model.unchanged,
  ignored: model.ignored,
});

/** A Single Package's Input: the project's folder itself. */
export const packageInput = ({
  model,
  state,
}: DataOf<typeof MonoverseShape, 'Package'>) => ({
  root: state.root,
  path: '.',
  name: nameIn(model, state),
});

/** A Single Package's Props: the branch, and how its tree is drawn. */
export const packageProps = ({
  model,
  state,
}: DataOf<typeof MonoverseShape, 'Package'>) => ({
  branch: model.branch,
  changes: shownChangesOf(model, state),
  unchanged: model.unchanged,
  ignored: model.ignored,
});

// 7. View

/** Whether a file is open over the tree. */
export const opensFile = ({ model, state }: DataOf<typeof MonoverseShape>) =>
  model.file !== null &&
  (state._tag === 'Monorepo' || state._tag === 'Package');

/** What the open file is read at: a FileViewer of its own for each. */
export const fileKey = ({ model, state }: DataOf<typeof MonoverseShape>) => {
  const changes = changesOf(model, state);
  return JSON.stringify([
    rootOf(state),
    model.branch,
    model.file,
    changes === null ? null : baseOf(model),
    changes === null,
    model.reloads,
  ]);
};

/** The FileViewer's Input: the file open, as the branch has it. */
export const fileInput = ({ model, state }: DataOf<typeof MonoverseShape>) => {
  const changes = changesOf(model, state);
  return {
    root: rootOf(state) ?? '',
    branch: model.branch,
    path: model.file ?? '',
    base: changes === null ? null : baseOf(model),
    inside: false,
    status:
      changes?.find((change) => change.path === model.file)?.status ?? null,
  };
};

/** Whether a folder is open over the tree, once what changed in it is read. */
export const opensFolder = ({ model, state }: DataOf<typeof MonoverseShape>) =>
  model.folder !== null &&
  (state._tag === 'Monorepo' || state._tag === 'Package') &&
  !awaitingChanges(model, state);

/** What the open folder is read at: a FolderViewer of its own for each. */
export const folderKey = ({ model, state }: DataOf<typeof MonoverseShape>) => {
  const changes = changesOf(model, state);
  return JSON.stringify([
    rootOf(state),
    model.branch,
    model.folder?.path,
    changes === null ? null : baseOf(model),
    changes === null,
    model.reloads,
  ]);
};

/** The FolderViewer's Input: the folder open, its files, and what changed in it. */
export const folderInput = ({
  model,
  state,
}: DataOf<typeof MonoverseShape>) => {
  const changes = changesOf(model, state);
  const path = model.folder?.path ?? '';
  return {
    root: rootOf(state) ?? '',
    branch: model.branch,
    base: changes === null ? null : baseOf(model),
    path,
    title:
      path === ''
        ? (model.projects?.find((one) => one.id === projectOf(state))?.name ??
          'The project')
        : path,
    files: model.folder?.files ?? [],
    changed: (changes ?? []).filter((change) => isWithin(change.path, path)),
    sourceRoots: model.folder?.sourceRoots ?? null,
  };
};
