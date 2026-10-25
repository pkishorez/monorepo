import {
  blank,
  DraftModeLive,
  Mode,
  modesOf,
  owner,
  takes,
  writtenOf,
} from './actor.ts';
import { btwSearched } from './btw.ts';
import { keeping } from './keep.ts';
import { TouchDraft } from './touch/index.ts';
import { Compose, DraftModeView } from './view.tsx';

export type { Mode, Outcome } from './actor.ts';
export type { Composing } from './view.tsx';

export const DraftMode = {
  actor: DraftModeLive,
  view: DraftModeView,
  /** How the Draft draws a mode: its card, around the mode's own text. */
  Compose,
  /** What the Draft hands each mode's Touch Draft as it is drawn. */
  Touch: TouchDraft.Touch,
  /** The Layer the Draft Provides: what each mode hands it. */
  owner,
  /** The Keep Workers of a part of the Draft, as each mode's are. */
  keeping,
  Mode,
  blank,
  writtenOf,
  modesOf,
  takes,
  btwSearched,
};
