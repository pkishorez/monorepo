import { ProjectsLive } from './actor.ts';
import { ProjectsButton, ProjectsNotice, ProjectsView } from './view.tsx';

export const Projects = {
  actor: ProjectsLive,
  view: ProjectsView,
  button: ProjectsButton,
  notice: ProjectsNotice,
};
