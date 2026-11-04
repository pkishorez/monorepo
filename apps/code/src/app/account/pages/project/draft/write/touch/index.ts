import { View } from '@kestack/kabuki/react';
import { owner, TouchLive } from './actor.ts';
import { Given } from './touch.ts';

export type { Stop } from './controls/index.ts';

export const Touch = {
  actor: TouchLive,
  /** Loaded with the Draft's own View, the editor with it. */
  view: View.lazy(TouchLive, () => import('./view.tsx')),
  /** What the Draft hands the view. */
  Given,
  /** The Layer the Draft Provides: how it is sent. */
  owner,
};
