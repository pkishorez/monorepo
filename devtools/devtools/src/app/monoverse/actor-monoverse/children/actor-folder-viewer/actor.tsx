import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import {
  FileViewer,
  FileViewerView,
} from '../shared/actor-file-viewer/index.js';
import {
  FolderViewerShape,
  fileInput,
  init,
  shownKey,
  showsFile,
  updates,
} from './logic/index.js';
import { Body } from './view/index.js';

export const FolderViewer = FolderViewerShape.build({
  init,
  on: updates,
  children: {
    // 2. Show
    file: Actor.child(FileViewer, {
      while: showsFile,
      key: shownKey,
      input: fileInput,
      emits: { Closed: () => ({ _tag: 'WentBack' }) },
    }),
  },
});

export const FolderViewerView = View.make(FolderViewer, (self) => (
  <Body
    {...self}
    file={
      self.children.file === undefined ? null : (
        <FileViewerView instance={self.children.file} />
      )
    }
  />
));
