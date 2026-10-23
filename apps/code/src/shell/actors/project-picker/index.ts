import { ProjectPickerLive } from './actor.ts';
import {
  ProjectPickerButton,
  ProjectPickerNotice,
  ProjectPickerView,
} from './view.tsx';

export const ProjectPicker = {
  actor: ProjectPickerLive,
  view: ProjectPickerView,
  button: ProjectPickerButton,
  notice: ProjectPickerNotice,
};
