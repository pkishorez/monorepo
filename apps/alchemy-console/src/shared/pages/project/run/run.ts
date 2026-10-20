import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';

/**
 * One run of a project, at `/projects/:projectId/runs/:runId`: the run
 * followed live, step by step and resource by resource, its log, and how it
 * ended. It has no data of its own: the run is watched from the browser.
 */
export const Run = Page.define({
  path: '/runs/:runId',
  params: { runId: Schema.String },
  metadata: { title: 'Run · Alchemy Console' },
});
