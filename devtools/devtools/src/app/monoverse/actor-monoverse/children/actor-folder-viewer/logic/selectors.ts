import type { DataOf } from '@kestack/kabuki/types';

import { shownOf, type FolderViewerShape } from './shared/index.js';

// 2. Show: the FileViewer beside the list.

/** Whether a file is shown beside the list. */
export const showsFile = ({ model, props }: DataOf<typeof FolderViewerShape>) =>
  shownOf(model, props) !== null;

/** The file shown, keying its FileViewer. */
export const shownKey = ({ model, props }: DataOf<typeof FolderViewerShape>) =>
  shownOf(model, props) ?? '';

/** The FileViewer's Input: the file shown, as the branch has it. */
export const fileInput = ({
  model,
  props,
}: DataOf<typeof FolderViewerShape>) => {
  const shown = shownOf(model, props);
  return {
    root: model.root,
    branch: model.branch,
    path: shown ?? '',
    base: model.base,
    status: model.changed.find(({ path }) => path === shown)?.status ?? null,
    inside: true,
  };
};
