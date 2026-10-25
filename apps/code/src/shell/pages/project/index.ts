import { Project as page, ProjectLive } from './actor.ts';
import { StarterLive, StarterView } from './starter/index.ts';
import { ProjectView } from './view.tsx';

export const Project = { page, actor: ProjectLive, view: ProjectView };

/** A new session in a project, shown outside its page. */
export const Starter = { actor: StarterLive, view: StarterView };
