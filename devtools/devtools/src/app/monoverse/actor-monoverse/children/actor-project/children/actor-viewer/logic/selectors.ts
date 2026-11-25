import type { DataOf } from '@kestack/kabuki/types';

import { shownOf, type ViewerShape } from './shared/index.js';

export const fileInput = ({
  model,
  state,
}: DataOf<typeof ViewerShape, 'File'>) => ({
  root: model.root,
  branch: model.branch,
  path: state.path,
  base: state.base,
  status: state.status,
  besideFolderList: false,
});

export const showsFile = ({
  props,
  state,
}: DataOf<typeof ViewerShape, 'Folder'>) => shownOf(state, props) !== null;

export const shownKey = ({
  props,
  state,
}: DataOf<typeof ViewerShape, 'Folder'>) => shownOf(state, props) ?? '';

export const shownInput = ({
  model,
  props,
  state,
}: DataOf<typeof ViewerShape, 'Folder'>) => {
  const shown = shownOf(state, props);
  return {
    root: model.root,
    branch: model.branch,
    path: shown ?? '',
    base: state.base,
    status: state.changed.find(({ path }) => path === shown)?.status ?? null,
    besideFolderList: true,
  };
};
