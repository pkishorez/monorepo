import { Actor } from '@kestack/kabuki';
import { Routes } from '../../routes/index.ts';
import { List } from './list/index.ts';
import { Project } from './project/index.ts';
import { Share } from './share/index.ts';

/**
 * The outlet serves the list and the share dialog. The project itself is a
 * slot of Projects' own, keyed by its id and filled for the project and its
 * dialog alike, so the dialog opens over a page that keeps running.
 */
export const pages = Routes.Projects.outlet({
  List,
  Project: () => null,
  Share,
});

export const ProjectsActor = Actor.make('Projects', {
  props: Routes.Projects.props,
}).build({
  children: {
    ...pages.children,
    open: {
      actor: Project.actor,
      each: ({ props: { page } }) =>
        page._tag === 'List' ? [] : [String(page.id)],
      input: (_, id) => ({ id: Number(id) }),
    },
  },
});
