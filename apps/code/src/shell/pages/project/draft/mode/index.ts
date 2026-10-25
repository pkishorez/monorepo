import {
  blank,
  DraftModeLive,
  Given,
  Mode,
  modesOf,
  owner,
  takes,
} from './actor.ts';
import { searchedQuestion } from './carry.ts';
import { TouchDraft } from './touch/index.ts';
import { Compose, DraftModeView } from './view.tsx';

export type { Mode } from './actor.ts';
export type { Composing } from './view.tsx';

export const DraftMode = {
  actor: DraftModeLive,
  view: DraftModeView,
  /** How the Draft draws a mode: its card, around the mode's own text. */
  Compose,
  /** What the Draft hands each mode's Touch Draft as it is drawn. */
  Touch: TouchDraft.Touch,
  /** The Layer the Draft Provides: what each mode shows and hands it. */
  owner,
  Mode,
  Given,
  blank,
  modesOf,
  takes,
  searchedQuestion,
};
