import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { ProjectDetail } from '../../contracts/project/index.ts';
import { Api } from '../capabilities/index.ts';
import { Run } from './run/index.ts';

/**
 * A project, at `/projects/:projectId`: its Production stage, live, and the
 * stage's latest run drawn as it goes, so every open tab watches a deploy
 * tick along. Drawn by the Worker with the project in it; a project that
 * isn't the member's is not found. Its one page is a run of it.
 */
export const Project = Page.define({
  path: '/projects/:projectId',
  params: { projectId: Schema.String },
  metadata: { title: 'Project · Alchemy Console' },
  // Null for a visitor Console turns away.
  data: Schema.NullOr(ProjectDetail),
  pages: { Run },
  requires: [Api],
  model: Schema.Struct({
    /** As the User Space last said; null until it has. */
    live: Schema.NullOr(ProjectDetail),
  }),
  message: Schema.TaggedUnion({
    DetailSeen: { detail: ProjectDetail },
  }),
});
