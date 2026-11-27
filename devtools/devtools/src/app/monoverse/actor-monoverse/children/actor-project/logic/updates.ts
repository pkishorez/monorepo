import type { DataOf, InitOf, UpdatesOf } from '@kestack/kabuki/types';

import {
  analysisAt,
  changesAt,
  type ProjectShape,
  type Where,
} from './shared/index.js';

const viewedForChanges = (
  { props, state }: DataOf<typeof ProjectShape>,
  path: string,
) =>
  state._tag === 'Monorepo' &&
  props.package === null &&
  state.workspace.packages.some((one) => one.path === path);

const moved = (props: Where, change: Partial<Where>) => ({
  _tag: 'Moved' as const,
  package: props.package,
  branch: props.branch,
  base: props.base,
  changes: props.changes,
  ...change,
});

export const init: InitOf<typeof ProjectShape> = ({ root }) => ({
  model: {
    root,
    branches: null,
    gitProblem: null,
    changed: null,
    changesProblem: null,
    open: null,
    reloads: 0,
  },
  state: { _tag: 'Opening' },
});

export const updates: UpdatesOf<typeof ProjectShape> = {
  Analysed: ({ at, workspace, links, cycles }, data) => {
    if (at !== analysisAt(data)) return {};
    return {
      state:
        workspace.kind === 'single-package'
          ? { _tag: 'Package', at, workspace }
          : { _tag: 'Monorepo', at, workspace, links, cycles },
    };
  },
  AnalyseRefused: ({ at, problem, missing }, data) => {
    if (at !== analysisAt(data)) return {};
    return { state: { _tag: 'Failure', at, problem, missing } };
  },
  Retried: (_, { model, state }) => ({
    model: {
      reloads: model.reloads + 1,
      gitProblem: null,
      changesProblem: null,
    },
    ...(state._tag === 'Failure'
      ? { state: { _tag: 'Opening' as const } }
      : {}),
  }),
  BranchesRead: ({ branches }) => ({
    model: { branches, gitProblem: null },
  }),
  BranchesRefused: ({ problem }) => ({
    model: { branches: null, gitProblem: problem },
  }),
  BranchChosen: ({ branch }, { model, props }) => {
    const named = branch === model.branches?.current ? null : branch;
    if (named === props.branch) return {};
    return { emit: moved(props, { branch: named }) };
  },
  BaseChosen: ({ base }, { model, props }) => {
    const named = base === model.branches?.defaultBase ? null : base;
    if (named === props.base) return {};
    return { emit: moved(props, { base: named }) };
  },
  ChangesToggled: (_, { props }) => ({
    model: { changesProblem: null },
    emit: moved(props, { changes: !props.changes }),
  }),
  DeletedToggled: () => ({ emit: { _tag: 'DeletedToggled' } }),
  UnchangedChosen: ({ unchanged }) => ({
    emit: { _tag: 'UnchangedChosen', unchanged },
  }),
  IgnoredToggled: () => ({ emit: { _tag: 'IgnoredToggled' } }),
  ChangesRead: ({ at, files }, data) =>
    at === changesAt(data)
      ? { model: { changed: { at, files }, changesProblem: null } }
      : {},
  ChangesRefused: ({ at, problem }, data) =>
    at === changesAt(data) ? { model: { changesProblem: problem } } : {},
  Entered: ({ package: path }, { props, state }) => {
    if (state._tag !== 'Monorepo' || path === props.package) return {};
    return { model: { open: null }, emit: moved(props, { package: path }) };
  },
  Left: (_, { props }) => {
    if (props.package === null) return {};
    return { model: { open: null }, emit: moved(props, { package: null }) };
  },
  Followed: ({ package: path }, { model }) =>
    model.open === null || model.open.package === path
      ? {}
      : { model: { open: null } },
  FileOpened: ({ path }, { props }) => ({
    model: { open: { _tag: 'File', path, package: props.package } },
  }),
  FolderViewed: ({ path, files, sourceRoots }, data) => {
    const { props } = data;
    const open = {
      _tag: 'Folder' as const,
      path,
      package: props.package,
      files,
      sourceRoots,
    };
    if (props.changes || !viewedForChanges(data, path))
      return { model: { open } };
    return {
      model: { open, changesProblem: null },
      emit: moved(props, { changes: true }),
    };
  },
  ViewClosed: () => ({ model: { open: null } }),
  SwitchAsked: () => ({ emit: { _tag: 'SwitchAsked' } }),
};
