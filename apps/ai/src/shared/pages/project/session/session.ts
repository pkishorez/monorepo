import { Effect, Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  ask,
  Attached,
  cancel,
  forkSession,
  HarnessInfo,
  loadSkills,
  Messages,
  Refused,
  send,
  SessionRow,
  SkillSchema,
  wire,
} from '../../ai/index.ts';
import { session } from '../../places/index.ts';
import { btwQuestion } from './btw.ts';

/*
 * A session: its row, its messages, and the composer.
 *
 * 1. Read     the row says whether it runs; its messages sync while the
 *             page is open, through the session's Window. Once the View has
 *             the row, it says which agent and project it is in, and which
 *             session it was forked from, whose row is read for its title.
 * 2. Skills   read once the agent is known, for the `/` menu; none when the
 *             server cannot say, and nothing waits for them.
 * 3. Send     the draft and its files go to the server, which starts a turn
 *             when the session is idle, and steers the running one
 *             otherwise. The draft clears at once; refused, it comes back.
 * 4. Ask      a draft that starts with `/btw` is a question on the side: its
 *             answer shows over the composer, never in the transcript, and
 *             the session goes on as it was. A newer question replaces it.
 * 5. Fork     a new session from this one's context up to a turn's end;
 *             the app moves to it.
 * 6. Stop     cancels the running turn.
 * 7. Open     which tool calls, thoughts and subagents are shown open.
 */

const Draft = Schema.Struct({
  text: Schema.String,
  attachments: Schema.Array(Attached),
});

const Asked = Schema.Struct({
  id: Schema.Finite,
  question: Schema.String,
  /** null while it is being answered, or when it failed. */
  answer: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
});

const Seen = Schema.Struct({
  projectId: Schema.String,
  harness: HarnessInfo.fields.name,
  /** The session it was forked from, if any. */
  parentId: Schema.NullOr(Schema.String),
});

export const Session = Page.define({
  path: '/s/:sessionId',
  params: { sessionId: Schema.String },
  metadata: { title: 'Session · AI' },
  requires: [AiClient],
  model: Schema.Struct({
    draft: Schema.String,
    attachments: Schema.Array(Attached),
    /** Sent and not yet answered: brought back if the server refuses it. */
    unsent: Schema.NullOr(Draft),
    stopping: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
    open: Schema.Array(Schema.String),
    seen: Schema.NullOr(Seen),
    skills: Schema.NullOr(Schema.Array(SkillSchema)),
    asked: Schema.NullOr(Asked),
    /** The last question's id: a late answer to a dismissed one is told apart. */
    asks: Schema.Finite,
    /** The turn a fork is being made after. */
    forking: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Seen: Seen.fields,
    SkillsLoaded: {
      harness: HarnessInfo.fields.name,
      skills: Schema.Array(SkillSchema),
    },
    Typed: { text: Schema.String },
    Attach: { attachments: Schema.Array(Attached) },
    Send: {},
    Stop: {},
    Toggle: { id: Schema.String },
    Sent: {},
    Stopped: {},
    Answered: { id: Schema.Finite, answer: Schema.String },
    AskRefused: { id: Schema.Finite, reason: Schema.String },
    Dismiss: {},
    Fork: { afterTurnId: Schema.String },
    Forked: { projectId: Schema.String, sessionId: Schema.String },
    Refused,
  }),
});

export const SessionLive = Page.build(Session, {
  init: () => ({
    model: {
      draft: '',
      attachments: [],
      unsent: null,
      stopping: false,
      problem: null,
      open: [],
      seen: null,
      skills: null,
      asked: null,
      asks: 0,
      forking: null,
    },
  }),
  // 1. Read
  children: {
    session: {
      actor: SessionRow,
      props: ({ props }) => ({ sessionId: props.params.sessionId }),
    },
    messages: {
      actor: Messages,
      props: ({ props }) => ({ sessionId: props.params.sessionId }),
    },
    parent: {
      actor: SessionRow,
      while: ({ model }) => model.seen?.parentId != null,
      props: ({ model }) => ({ sessionId: model.seen?.parentId ?? '' }),
    },
  },
  // 2. Skills
  workers: {
    skills: {
      while: ({ model }) => model.seen !== null && model.skills === null,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          if (model.seen === null) return;
          yield* self.send(
            yield* loadSkills(model.seen.projectId, model.seen.harness),
          );
        }),
    },
  },
  on: {
    Seen: (seen, { model }) =>
      model.seen?.harness === seen.harness &&
      model.seen.projectId === seen.projectId &&
      model.seen.parentId === seen.parentId
        ? {}
        : {
            model: {
              ...model,
              seen: {
                projectId: seen.projectId,
                harness: seen.harness,
                parentId: seen.parentId,
              },
            },
          },
    SkillsLoaded: ({ harness, skills }, { model }) =>
      model.seen?.harness === harness ? { model: { ...model, skills } } : {},
    Typed: ({ text }, { model }) => ({ model: { ...model, draft: text } }),
    Attach: ({ attachments }, { model }) => ({
      model: { ...model, attachments },
    }),
    Send: (_, { model, props }) => {
      // 4. Ask
      const question = btwQuestion(model.draft);
      if (question === '')
        return {
          model: { ...model, problem: 'Write a question after /btw' },
        };
      if (question !== null) {
        const id = model.asks + 1;
        return {
          model: {
            ...model,
            draft: '',
            problem: null,
            asked: { id, question, answer: null, problem: null },
            asks: id,
          },
          command: ask({ id, sessionId: props.params.sessionId, question }),
        };
      }
      // 3. Send
      const text = model.draft.trim();
      if (text === '' && model.attachments.length === 0) return {};
      return {
        model: {
          ...model,
          draft: '',
          attachments: [],
          unsent: { text, attachments: model.attachments },
          problem: null,
        },
        command: send({
          sessionId: props.params.sessionId,
          text,
          attachments: wire(model.attachments),
        }),
      };
    },
    Sent: (_, { model }) => ({ model: { ...model, unsent: null } }),
    Answered: ({ id, answer }, { model }) =>
      model.asked?.id === id
        ? { model: { ...model, asked: { ...model.asked, answer } } }
        : {},
    AskRefused: ({ id, reason }, { model }) =>
      model.asked?.id === id
        ? { model: { ...model, asked: { ...model.asked, problem: reason } } }
        : {},
    Dismiss: (_, { model }) => ({ model: { ...model, asked: null } }),
    // 5. Fork
    Fork: ({ afterTurnId }, { model, props }) =>
      model.forking !== null
        ? {}
        : {
            model: { ...model, forking: afterTurnId, problem: null },
            command: forkSession({
              sessionId: props.params.sessionId,
              afterTurnId,
            }),
          },
    Forked: ({ projectId, sessionId }, { model }) => ({
      model: { ...model, forking: null },
      command: Router.push(session(projectId, sessionId)),
    }),
    // 6. Stop
    Stop: (_, { model, props }) =>
      model.stopping
        ? {}
        : {
            model: { ...model, stopping: true, problem: null },
            command: cancel({ sessionId: props.params.sessionId }),
          },
    Stopped: (_, { model }) => ({ model: { ...model, stopping: false } }),
    Refused: ({ reason }, { model }) => {
      const back =
        model.draft === '' && model.attachments.length === 0
          ? model.unsent
          : null;
      return {
        model: {
          ...model,
          problem: reason,
          stopping: false,
          forking: null,
          draft: back?.text ?? model.draft,
          attachments: back?.attachments ?? model.attachments,
          unsent: null,
        },
      };
    },
    // 7. Open
    Toggle: ({ id }, { model }) => ({
      model: {
        ...model,
        open: model.open.includes(id)
          ? model.open.filter((each) => each !== id)
          : [...model.open, id],
      },
    }),
  },
});
