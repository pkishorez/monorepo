import { owner, TouchDraftLive } from './actor.ts';
import { Touch, TouchDraftView } from './view.tsx';

export const TouchDraft = {
  actor: TouchDraftLive,
  view: TouchDraftView,
  /** What the Draft hands the view. */
  Touch,
  /** The Layer the Draft Provides: how it is sent. */
  owner,
};
