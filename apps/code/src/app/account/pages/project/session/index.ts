import { View } from '@kestack/kabuki/react';
import { Session as page, SessionLive } from './actor.ts';
import { Folder } from './transcript/tool/parse/index.ts';

/**
 * Draws nothing; says once it can be drawn whole. Loads with its View, and
 * once loaded never waits, as `React.lazy` would on its first draw. Made
 * before the View, so the router finds the View by the Actor and preloads it.
 */
const ready = View.lazy(SessionLive, () =>
  import('./view.tsx').then(({ SessionReady }) => ({ default: SessionReady })),
);

export const Session = {
  page,
  actor: SessionLive,
  view: View.lazy(SessionLive, () => import('./view.tsx')),
  ready,
  Folder,
};
