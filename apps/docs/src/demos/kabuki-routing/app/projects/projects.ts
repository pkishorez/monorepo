import { Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { List } from './list/index.ts';
import { Project } from './project/index.ts';

/**
 * Everything under /projects. Where the URL ends here, it draws the list,
 * an Actor of its own made only while no project is open; the project is
 * its page, and the share dialog the project's.
 */
export const Projects = Route.page({
  path: '/projects',
  query: { q: Schema.optionalKey(Schema.String) },
  metadata: { title: 'Projects · Acme' },
  pages: { Project },
}).build({
  children: {
    list: {
      actor: List.actor,
      while: ({ props }) => !props.route.page,
      props: ({ props }) => props.query,
    },
  },
});
