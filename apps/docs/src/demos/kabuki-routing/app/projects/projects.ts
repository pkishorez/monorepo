import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { ListLive } from './list/index.ts';
import { Project, ProjectLive } from './project/index.ts';

/**
 * Everything under /projects. Where the URL ends here, it draws the list,
 * an Actor of its own made only while no project is open; the project is
 * its page, and the share dialog the project's.
 */
export const Projects = Page.define({
  path: '/projects',
  query: { q: Schema.optionalKey(Schema.String) },
  metadata: { title: 'Projects · Acme' },
  pages: { Project },
});

export const ProjectsLive = Page.build(Projects, {
  pages: { Project: ProjectLive },
  children: {
    list: {
      actor: ListLive,
      while: ({ props }) => !props.route.page,
      props: ({ props }) => props.query,
    },
  },
});
