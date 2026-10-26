import { View } from '@kestack/kabuki/react';
import { placeIn, Project as page, ProjectLive } from './actor.ts';

/**
 * Draws nothing; says it can be drawn whole. Loads with its View, and once
 * loaded never waits, as `React.lazy` would on its first draw. Made before
 * the View, so the router finds the View by the Actor and preloads it.
 */
const ready = View.lazy(ProjectLive, () =>
  import('./view.tsx').then(({ ProjectReady }) => ({ default: ProjectReady })),
);

export const Project = {
  page,
  actor: ProjectLive,
  view: View.lazy(ProjectLive, () => import('./view.tsx')),
  /** The place in it the URL names, as it says it is ready at. */
  placeIn,
  ready,
};
