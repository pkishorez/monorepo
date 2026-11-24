import { View } from '@kestack/kabuki/react';

import { ProjectPickerShape, init, updates, workers } from './logic/index.js';
import { Body } from './view/index.js';

export const ProjectPicker = ProjectPickerShape.build({
  init,
  on: updates,
  workers,
});

export const ProjectPickerView = View.make(ProjectPicker, (self) => (
  <Body {...self} />
));
