import { Schema } from 'effect';

/** The steps of the application, in order. Education is cut (see notes.md). */
export const STEPS = [
  'PersonalInfo',
  'WorkHistory',
  'Skills',
  'CoverLetter',
  'Attachments',
  'Review',
] as const;

export const Step = Schema.Literals(STEPS);
export type Step = typeof Step.Type;

export const stepLabel: Record<Step, string> = {
  PersonalInfo: 'Personal Info',
  WorkHistory: 'Work History',
  Skills: 'Skills',
  CoverLetter: 'Cover Letter',
  Attachments: 'Attachments',
  Review: 'Review',
};

/** The step `by` places after `step`, staying put at either end. */
export const stepAfter = (step: Step, by: 1 | -1): Step =>
  STEPS[STEPS.indexOf(step) + by] ?? step;
