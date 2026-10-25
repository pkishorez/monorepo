import {
  blank,
  DraftModeLive,
  Mode,
  modeOf,
  modesOf,
  Reset,
  takes,
  Written,
  writtenOf,
} from './actor.ts';
import { DraftModeView, Edits } from './view.tsx';

export type { Mode, Written } from './actor.ts';

export const DraftMode = {
  actor: DraftModeLive,
  view: DraftModeView,
  /** Where each mode's View says how an edit reaches it. */
  Edits,
  Mode,
  Written,
  Reset,
  blank,
  writtenOf,
  modesOf,
  modeOf,
  takes,
};
