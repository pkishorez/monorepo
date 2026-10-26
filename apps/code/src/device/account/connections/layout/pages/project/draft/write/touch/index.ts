import { View } from '@kestack/kabuki/react';
import { owner, TouchDraftLive } from './actor.ts';
import { Touch } from './touch.ts';

export const TouchDraft = {
  actor: TouchDraftLive,
  /** Loaded with the Draft's own View, the editor with it. */
  view: View.lazy(TouchDraftLive, () => import('./view.tsx')),
  /** What the Draft hands the view. */
  Touch,
  /** The Layer the Draft Provides: how it is sent. */
  owner,
};
