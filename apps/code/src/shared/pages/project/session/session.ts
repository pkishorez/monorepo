import { Effect, Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  ask,
  Attached,
  cancel,
  forkSession,
  HarnessInfo,
  loadHarnesses,
  loadModels,
  loadSkills,
  Messages,
  ModelInfo,
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
 * 2. Skills   read once the agent is known, for the `/` palette, and
 *             nothing waits for them. When they cannot be read the palette
 *             says why, and opening it again tries again.
 * 3. Models   the agent's settings and models, read once the agent is
 *             known, for the pickers. A model or setting picked here goes
 *             with every message after it; until then the session's own.
 * 4. Send     the draft and its files go to the server, which starts a turn
 *             when the session is idle, and steers the running one
 *             otherwise. The draft clears at once; refused, it comes back.
 * 5. Ask      a draft that starts with `/btw` is a question on the side: its
 *             answer shows over the composer, never in the transcript, and
 *             the session goes on as it was. A newer question replaces it.
 * 6. Fork     a new session from this one's context up to a turn's end;
 *             the app moves to it.
 * 7. Stop     cancels the running turn.
 * 8. Open     which tool calls, thoughts and subagents are shown open.
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

const Models = Schema.Struct({
  status: Schema.Literals(['ready', 'failed']),
  list: Schema.Array(ModelInfo),
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
  metadata: { title: 'Session · code' },
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
    /** Why the skills could not be read; null when they were or still may be. */
    skillsProblem: Schema.NullOr(Schema.String),
    /** Every agent the server runs, for this one's settings; null until read, none when it could not say. */
    harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
    models: Schema.NullOr(Models),
    /** Picked here, sent with each message; null keeps the session's. */
    model: Schema.NullOr(Schema.String),
    settings: Schema.Record(Schema.String, Schema.String),
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
    SkillsFailed: { harness: HarnessInfo.fields.name, reason: Schema.String },
    RetrySkills: {},
    HarnessesLoaded: { harnesses: Schema.Array(HarnessInfo) },
    HarnessesFailed: { reason: Schema.String },
    ModelsLoaded: {
      harness: HarnessInfo.fields.name,
      models: Schema.Array(ModelInfo),
    },
    ModelsFailed: { harness: HarnessInfo.fields.name, reason: Schema.String },
    PickModel: { model: Schema.String },
    PickSetting: { key: Schema.String, value: Schema.String },
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
      skillsProblem: null,
      harnesses: null,
      models: null,
      model: null,
      settings: {},
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
    // 3. Models
    harness: {
      while: ({ model }) => model.seen !== null && model.harnesses === null,
      run: (self) => Effect.flatMap(loadHarnesses, self.send),
    },
    models: {
      while: ({ model }) => model.seen !== null && model.models === null,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          if (model.seen === null) return;
          yield* self.send(yield* loadModels(model.seen.harness));
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
      model.seen?.harness === harness
        ? { model: { ...model, skills, skillsProblem: null } }
        : {},
    SkillsFailed: ({ harness, reason }, { model }) =>
      model.seen?.harness === harness
        ? { model: { ...model, skills: [], skillsProblem: reason } }
        : {},
    // Clearing a failed read starts it again.
    RetrySkills: (_, { model }) =>
      model.skillsProblem === null
        ? {}
        : { model: { ...model, skills: null, skillsProblem: null } },
    HarnessesLoaded: ({ harnesses }, { model }) => ({
      model: { ...model, harnesses },
    }),
    // Without the agent's settings its picker stays hidden; sending works.
    HarnessesFailed: (_, { model }) => ({ model: { ...model, harnesses: [] } }),
    ModelsLoaded: ({ harness, models }, { model }) =>
      model.seen?.harness === harness
        ? {
            model: {
              ...model,
              models: { status: 'ready', list: models, problem: null },
            },
          }
        : {},
    ModelsFailed: ({ harness, reason }, { model }) =>
      model.seen?.harness === harness
        ? {
            model: {
              ...model,
              models: { status: 'failed', list: [], problem: reason },
            },
          }
        : {},
    PickModel: ({ model: picked }, { model }) => ({
      model: { ...model, model: picked },
    }),
    PickSetting: ({ key, value }, { model }) => ({
      model: { ...model, settings: { ...model.settings, [key]: value } },
    }),
    Typed: ({ text }, { model }) => ({ model: { ...model, draft: text } }),
    Attach: ({ attachments }, { model }) => ({
      model: { ...model, attachments },
    }),
    Send: (_, { model, props }) => {
      // 5. Ask
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
      // 4. Send
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
          ...(model.model === null ? {} : { model: model.model }),
          ...(Object.keys(model.settings).length === 0
            ? {}
            : { settings: model.settings }),
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
    // 6. Fork
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
    // 7. Stop
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
    // 8. Open
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
