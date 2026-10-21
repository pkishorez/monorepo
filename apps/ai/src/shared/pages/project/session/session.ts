import { Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Page } from '@kestack/kabuki/routing';
import { cancel, Messages, Refused, send, SessionRow } from '../../ai/index.ts';

/*
 * A session: its row, its messages, and the composer.
 *
 * 1. Read     the row says whether it runs; its messages sync while the
 *             page is open, through the session's Window.
 * 2. Send     the draft goes to the server, which starts a turn when the
 *             session is idle, and steers the running one otherwise. The
 *             draft clears at once; refused, it comes back.
 * 3. Stop     cancels the running turn.
 * 4. Open     which tool calls, thoughts and subagents are shown open.
 */

export const Session = Page.define({
  path: '/s/:sessionId',
  params: { sessionId: Schema.String },
  metadata: { title: 'Session · AI' },
  requires: [AiClient],
  model: Schema.Struct({
    draft: Schema.String,
    /** Sent and not yet answered: brought back if the server refuses it. */
    unsent: Schema.NullOr(Schema.String),
    stopping: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
    open: Schema.Array(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Typed: { text: Schema.String },
    Send: {},
    Stop: {},
    Toggle: { id: Schema.String },
    Sent: {},
    Stopped: {},
    Refused,
  }),
});

export const SessionLive = Page.build(Session, {
  init: () => ({
    model: {
      draft: '',
      unsent: null,
      stopping: false,
      problem: null,
      open: [],
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
  },
  on: {
    Typed: ({ text }, { model }) => ({ model: { ...model, draft: text } }),
    // 2. Send
    Send: (_, { model, props }) => {
      const text = model.draft.trim();
      if (text === '') return {};
      return {
        model: { ...model, draft: '', unsent: text, problem: null },
        command: send({ sessionId: props.params.sessionId, text }),
      };
    },
    Sent: (_, { model }) => ({ model: { ...model, unsent: null } }),
    // 3. Stop
    Stop: (_, { model, props }) =>
      model.stopping
        ? {}
        : {
            model: { ...model, stopping: true, problem: null },
            command: cancel({ sessionId: props.params.sessionId }),
          },
    Stopped: (_, { model }) => ({ model: { ...model, stopping: false } }),
    Refused: ({ reason }, { model }) => ({
      model: {
        ...model,
        problem: reason,
        stopping: false,
        draft:
          model.draft === '' && model.unsent !== null
            ? model.unsent
            : model.draft,
        unsent: null,
      },
    }),
    // 4. Open
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
