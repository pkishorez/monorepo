import { View } from '@kestack/kabuki/react';

import { FileViewerShape, init, updates, workers } from './logic/index.js';
import { Body } from './view/index.js';

export const FileViewer = FileViewerShape.build({ init, on: updates, workers });

export const FileViewerView = View.make(FileViewer, (self) => (
  <Body {...self} />
));
