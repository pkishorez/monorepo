import { Effect, Schema, Stream } from 'effect';
import {
  AgentQuestionSchema,
  CodeClient,
  type QuestionItem,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Answering, Connections } from '../../../../../connections.ts';
import { Refused } from '../../../../../connection/link/index.ts';
import {
  fresh,
  sameAnswering,
  stillAsked,
} from '../../../../../connection/records/index.ts';
import {
  answerFor,
  choose,
  chooseOther,
  draftOf,
  type ItemDraft,
  type,
  unanswered,
} from './answer.ts';
import { answer } from './commands.ts';

/*
 * The Question Panel: the Agent Questions the open Session's agent waits
 * on, answered in the page's content column, in the Draft's place.
 *
 * 1. Follow    this session's Agent Questions, as its Connection says them in
 *              `Connections`; the first not yet answered here is the one
 *              shown. A question gone from them, answered elsewhere or its
 *              Turn ended, takes its answer so far with it, and the Draft
 *              comes back as it was.
 * 2. Minimise  each question is expanded, over the transcript, or
 *              minimised, to a bar where the Draft was, as the user asks,
 *              and kept so while it is asked; a question first seen is
 *              expanded.
 * 3. Answer    each Item's answer so far is kept while the question is
 *              asked, minimised or not. Sending with an Item unanswered
 *              sends nothing, but marks the ones left; sent, the question
 *              is not shown again, and a refusal says why and keeps it as
 *              it was. Declining sends null.
 * 4. Keep      how its questions are being answered (`Answering`: the
 *              answers so far, minimised, tried and sent) is its Connection's
 *              to keep while each is asked, through `Connections`: read back
 *              as the panel opens, then given on each change. So leaving
 *              the session, or the page, and coming back finds it as it
 *              was left. What is being sent and why it was refused are the
 *              panel's alone.
 */

const Questions = Schema.Array(AgentQuestionSchema);
const sameQuestions = Schema.toEquivalence(Questions);

const Model = Schema.Struct({
  /** This session's Agent Questions, as its Connection says them, oldest first. */
  questions: Questions,
  /** How they are being answered, as its Connection keeps it too. */
  ...Answering.fields,
  /** Whether what its Connection kept has been read back, so it may be given again. */
  restored: Schema.Boolean,
  /** The question being answered or declined, while it is. */
  sending: Schema.NullOr(
    Schema.Struct({ questionId: Schema.String, declining: Schema.Boolean }),
  ),
  /** The last refusal, numbered so each is said once. */
  refused: Schema.NullOr(
    Schema.Struct({ n: Schema.Finite, reason: Schema.String }),
  ),
});
type Model = typeof Model.Type;

/** The question shown: the first not answered here; null while none is asked. */
export const shownOf = ({
  questions,
  sent,
}: Pick<Model, 'questions' | 'sent'>) =>
  questions.find(({ id }) => !sent.includes(id)) ?? null;

/** Whether a question is shown, and expanded over the transcript. */
export const expandedOf = (model: Model) => {
  const shown = shownOf(model);
  return shown !== null && !model.minimised.includes(shown.id);
};

const Item = { questionId: Schema.String, itemId: Schema.String };

export const Question = Actor.define('Question', {
  requires: [Connections, CodeClient],
  props: Schema.Struct({
    connectionId: Schema.String,
    sessionId: Schema.String,
  }),
  model: Model,
  message: Schema.TaggedUnion({
    Asked: { questions: Questions },
    Restored: { answering: Answering },
    Minimised: {},
    Expanded: {},
    Chose: { ...Item, label: Schema.String },
    ChoseOther: Item,
    Typed: { ...Item, text: Schema.String },
    SendAsked: {},
    DeclineAsked: {},
    Answered: { questionId: Schema.String },
    Refused,
  }),
});

type Change =
  | { readonly _tag: 'Chose'; readonly label: string }
  | { readonly _tag: 'ChoseOther' }
  | { readonly _tag: 'Typed'; readonly text: string };

const draftChange =
  (change: Change) => (item: QuestionItem, draft: ItemDraft) =>
    change._tag === 'Chose'
      ? choose(item, draft, change.label)
      : change._tag === 'ChoseOther'
        ? chooseOther(item, draft)
        : type(item, draft, change.text);

/** 3. An Item changed by `change`; none while its question is being sent. */
const changed = (
  model: Model,
  questionId: string,
  itemId: string,
  change: Change,
): Model => {
  const question = model.questions.find(({ id }) => id === questionId);
  const item = question?.items.find(({ id }) => id === itemId);
  if (item === undefined || model.sending?.questionId === questionId)
    return model;
  const drafts = model.drafts[questionId] ?? {};
  return {
    ...model,
    drafts: {
      ...model.drafts,
      [questionId]: {
        ...drafts,
        [itemId]: draftChange(change)(item, draftOf(drafts, item)),
      },
    },
  };
};

/** 1. Only what the Connection still lists is kept of each question. */
const keptOf = (model: Model, questions: typeof Questions.Type): Model => ({
  ...model,
  questions,
  ...stillAsked(answeringOf(model), new Set(questions.map(({ id }) => id))),
});

/** 4. What its Connection keeps of it. */
const answeringOf = ({ drafts, minimised, tried, sent }: Model): Answering => ({
  drafts,
  minimised,
  tried,
  sent,
});

/** 2. The question shown, minimised or expanded. */
const minimised = (model: Model, on: boolean): Model => {
  const shown = shownOf(model);
  if (shown === null || model.minimised.includes(shown.id) === on) return model;
  return {
    ...model,
    minimised: on
      ? [...model.minimised, shown.id]
      : model.minimised.filter((id) => id !== shown.id),
  };
};

export const QuestionLive = Question.build({
  init: () => ({
    model: {
      questions: [],
      ...fresh,
      restored: false,
      sending: null,
      refused: null,
    },
  }),
  workers: {
    // 1. Follow, once what its Connection kept is read back (4. Keep), so a
    // question minimised is never first drawn expanded.
    questions: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const connections = yield* Connections;
          const kept = yield* connections.answering(
            props.connectionId,
            props.sessionId,
          );
          yield* self.send({ _tag: 'Restored', answering: kept ?? fresh });
          yield* connections.questions(props.connectionId).pipe(
            Stream.map(
              (all) =>
                all.find(({ sessionId }) => sessionId === props.sessionId)
                  ?.questions ?? [],
            ),
            Stream.changesWith(sameQuestions),
            Stream.runForEach((questions) =>
              self.send({ _tag: 'Asked', questions: [...questions] }),
            ),
          );
        }),
    },
    // 4. Keep: given to its Connection on each change, once read back.
    keep: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const connections = yield* Connections;
          yield* self.changes.pipe(
            Stream.filter(({ model }) => model.restored),
            Stream.map(({ model }) => answeringOf(model)),
            Stream.changesWith(sameAnswering),
            Stream.runForEach((answering) =>
              connections.keepAnswering(
                props.connectionId,
                props.sessionId,
                answering,
              ),
            ),
          );
        }),
    },
  },
  on: {
    // 1. Follow
    Asked: ({ questions }, { model }) => ({ model: keptOf(model, questions) }),
    // 4. Keep
    Restored: ({ answering }, { model }) => ({
      model: { ...model, ...answering, restored: true },
    }),
    // 2. Minimise
    Minimised: (_, { model }) => ({ model: minimised(model, true) }),
    Expanded: (_, { model }) => ({ model: minimised(model, false) }),
    // 3. Answer
    Chose: ({ questionId, itemId, label }, { model }) => ({
      model: changed(model, questionId, itemId, { _tag: 'Chose', label }),
    }),
    ChoseOther: ({ questionId, itemId }, { model }) => ({
      model: changed(model, questionId, itemId, { _tag: 'ChoseOther' }),
    }),
    Typed: ({ questionId, itemId, text }, { model }) => ({
      model: changed(model, questionId, itemId, { _tag: 'Typed', text }),
    }),
    SendAsked: (_, { model, props }) => {
      const shown = shownOf(model);
      if (shown === null || model.sending !== null) return {};
      const drafts = model.drafts[shown.id];
      if (unanswered(shown, drafts).length > 0)
        return {
          model: model.tried.includes(shown.id)
            ? model
            : { ...model, tried: [...model.tried, shown.id] },
        };
      return {
        model: {
          ...model,
          sending: { questionId: shown.id, declining: false },
        },
        command: answer({
          sessionId: props.sessionId,
          questionId: shown.id,
          answer: answerFor(shown, drafts),
        }),
      };
    },
    DeclineAsked: (_, { model, props }) => {
      const shown = shownOf(model);
      return shown === null || model.sending !== null
        ? {}
        : {
            model: {
              ...model,
              sending: { questionId: shown.id, declining: true },
            },
            command: answer({
              sessionId: props.sessionId,
              questionId: shown.id,
              answer: null,
            }),
          };
    },
    Answered: ({ questionId }, { model }) => ({
      model: keptOf(
        { ...model, sent: [...model.sent, questionId], sending: null },
        model.questions,
      ),
    }),
    Refused: ({ reason }, { model }) => ({
      model: {
        ...model,
        sending: null,
        refused: { n: (model.refused?.n ?? 0) + 1, reason },
      },
    }),
  },
});
