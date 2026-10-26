import { ProjectPickerLive } from './actor.ts';
import {
  ProjectPickerButton,
  ProjectPickerNotice,
  ProjectPickerView,
} from './view.tsx';

export const Projects = {
  actor: ProjectPickerLive,
  view: ProjectPickerView,
  button: ProjectPickerButton,
  notice: ProjectPickerNotice,
};
