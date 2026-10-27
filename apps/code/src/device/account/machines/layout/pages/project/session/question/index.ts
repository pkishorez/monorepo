import { View } from '@kestack/kabuki/react';
import { expandedOf, QuestionLive, shownOf } from './actor.ts';
import { Around } from './question.ts';

/*
 * The Question Panel: its Actor, a Child of the session; its View, which
 * loads apart, with the session's; what the page hands it (`Around`); and
 * whether a question stands in for the Draft, and is expanded.
 */
export const Question = {
  actor: QuestionLive,
  view: View.lazy(QuestionLive, () => import('./view.tsx')),
  Around,
  shownOf,
  expandedOf,
};
