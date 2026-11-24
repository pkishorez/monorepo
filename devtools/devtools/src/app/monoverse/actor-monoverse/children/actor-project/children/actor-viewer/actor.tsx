import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import {
  FileViewer,
  FileViewerView,
} from './children/actor-file-viewer/index.js';
import {
  ViewerShape,
  fileInput,
  init,
  shownInput,
  shownKey,
  showsFile,
  updates,
} from './logic/index.js';
import { Body } from './view/index.js';

export const Viewer = ViewerShape.build({
  init,
  on: updates,
  states: {
    // 1. File
    File: {
      children: {
        file: Actor.child(FileViewer, {
          input: fileInput,
          emits: { Closed: () => ({ _tag: 'Closed' }) },
        }),
      },
    },
    // 3. Show
    Folder: {
      children: {
        file: Actor.child(FileViewer, {
          while: showsFile,
          key: shownKey,
          input: shownInput,
          emits: { Closed: () => ({ _tag: 'WentBack' }) },
        }),
      },
    },
  },
});

export const ViewerView = View.make(Viewer, (self) => (
  <Body
    {...self}
    file={
      self.children.file === undefined ? null : (
        <FileViewerView instance={self.children.file} />
      )
    }
  />
));
