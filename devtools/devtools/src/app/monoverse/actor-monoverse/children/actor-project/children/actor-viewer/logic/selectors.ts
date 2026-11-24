import type { DataOf } from '@kestack/kabuki/types';

import { shownOf, type ViewerShape } from './shared/index.js';

// 1. File

/** The FileViewer's Input: the file open, alone. */
export const fileInput = ({
  model,
  state,
}: DataOf<typeof ViewerShape, 'File'>) => ({
  root: model.root,
  branch: model.branch,
  path: state.path,
  base: state.base,
  status: state.status,
  inside: false,
});

// 3. Show: the FileViewer beside the list.

/** Whether a file is shown beside the list. */
export const showsFile = ({
  props,
  state,
}: DataOf<typeof ViewerShape, 'Folder'>) => shownOf(state, props) !== null;

/** The file shown, keying its FileViewer. */
export const shownKey = ({
  props,
  state,
}: DataOf<typeof ViewerShape, 'Folder'>) => shownOf(state, props) ?? '';

/** The FileViewer's Input: the file shown, as the branch has it. */
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
    inside: true,
  };
};
