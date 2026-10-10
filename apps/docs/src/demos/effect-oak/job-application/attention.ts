import { STEPS } from './application/index.js';
import type { Sheet, Step } from './application/index.js';

/** The steps with something to fill in; Review only shows the others. */
const FORM_STEPS = STEPS.filter(
  (step): step is Exclude<Step, 'Review'> => step !== 'Review',
);

/** Every step's required answers are valid. */
export const isComplete = (sheet: Sheet) =>
  FORM_STEPS.every((step) => sheet[step].complete);

/**
 * The steps to mark with `!`: errors showing, or not yet complete once
 * Submit was pressed.
 */
export const needingAttention = (model: {
  readonly sheet: Sheet;
  readonly submitAttempted: boolean;
}): ReadonlyArray<Step> =>
  FORM_STEPS.filter(
    (step) =>
      model.sheet[step].hasErrors ||
      (model.submitAttempted && !model.sheet[step].complete),
  );
