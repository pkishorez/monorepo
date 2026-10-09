import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import {
  Answers,
  blankSheet,
  Part,
  revealAll,
  Reveals,
  Sheet,
  Step,
  stepAfter,
} from './application/index.js';
import { isComplete } from './attention.js';
import { Attachments } from './attachments/index.js';
import { CoverLetter } from './cover-letter/index.js';
import { PersonalInfo } from './personal-info/index.js';
import { Skills } from './skills/index.js';
import { WorkHistory } from './work-history/index.js';

/*
 * A job application in six steps, with a live preview of the resume.
 *
 * Each step that keeps answers is a Child Node, and all five exist for the
 * whole app: the current step is Model data, and the View draws only its
 * Child. Making the steps States would destroy a step's Child, and
 * everything typed in it, on every move to another step (blocker 10).
 *
 * The application cannot read its Children (blocker 13), yet the step nav,
 * the preview, the review and the submit all need every answer. So each step
 * reports its whole Part through the Answers Request on every change, and
 * the application keeps the latest of each in its Sheet.
 *
 * Submit reveals every step's errors. That is a Message to each step, which
 * a parent cannot send (blocker 14): the Command posts to the Reveals
 * Service, and each step's Lifetime hears it.
 */

const SUBMIT_MS = 1500;

const submitApplication = Effect.sleep(SUBMIT_MS).pipe(
  Effect.as({ _tag: 'SucceededSubmit' as const }),
);

export const JobApplication = Node.make('JobApplication', {
  requires: { reveals: Reveals },
  model: Schema.Struct({
    step: Step,
    sheet: Sheet,
    submitAttempted: Schema.Boolean,
    submission: Schema.Literals(['NotSubmitted', 'Submitting', 'Submitted']),
  }),
  message: Schema.TaggedUnion({
    Reported: { part: Part },
    ClickedNext: {},
    ClickedPrevious: {},
    ChoseStep: { step: Step },
    ClickedSubmit: {},
    SucceededSubmit: {},
  }),
  provides: [Answers],
  children: {
    personalInfo: PersonalInfo,
    workHistory: WorkHistory,
    skills: Skills,
    coverLetter: CoverLetter,
    attachments: Attachments,
  },
}).build({
  init: () => ({
    model: {
      step: 'PersonalInfo',
      sheet: blankSheet,
      submitAttempted: false,
      submission: 'NotSubmitted',
    },
  }),
  provides: ({ send }) =>
    Context.make(Answers, {
      report: (part) => send({ _tag: 'Reported', part }),
    }),
  update: {
    Reported: ({ part }, { model }) => ({
      model: { ...model, sheet: { ...model.sheet, [part._tag]: part } },
    }),
    ClickedNext: (_, { model }) => ({
      model: { ...model, step: stepAfter(model.step, 1) },
    }),
    ClickedPrevious: (_, { model }) => ({
      model: { ...model, step: stepAfter(model.step, -1) },
    }),
    ChoseStep: ({ step }, { model }) => ({ model: { ...model, step } }),
    ClickedSubmit: (_, { model }) => {
      if (model.submission !== 'NotSubmitted') return {};
      const ready = isComplete(model.sheet);
      return {
        model: {
          ...model,
          submitAttempted: true,
          submission: ready ? 'Submitting' : 'NotSubmitted',
        },
        commands: ready ? [revealAll, submitApplication] : [revealAll],
      };
    },
    SucceededSubmit: (_, { model }) => ({
      model: { ...model, submission: 'Submitted' },
    }),
  },
});

export { RevealsLive as JobApplicationLive } from './application/index.js';
