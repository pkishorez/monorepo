import { Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { forkSession, Refused, regenerateTitle } from '../ai/index.ts';
import { session } from '../places/index.ts';

/*
 * What the header's menu does to the open session: write its Title afresh
 * from its latest messages, or fork it after its latest finished turn and
 * move to the fork. One at a time; a refusal says why until dismissed.
 */

export const SessionActions = Actor.define('SessionActions', {
  requires: [AiClient, Navigation],
  model: Schema.Struct({
    busy: Schema.NullOr(Schema.Literals(['title', 'fork'])),
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Retitle: { sessionId: Schema.String },
    Fork: { sessionId: Schema.String },
    Retitled: {},
    Forked: { projectId: Schema.String, sessionId: Schema.String },
    Dismiss: {},
    Refused,
  }),
});

export const SessionActionsLive = Actor.build(SessionActions, {
  init: () => ({ model: { busy: null, problem: null } }),
  on: {
    Retitle: ({ sessionId }, { model }) =>
      model.busy !== null
        ? {}
        : {
            model: { busy: 'title', problem: null },
            command: regenerateTitle({ sessionId }),
          },
    Fork: ({ sessionId }, { model }) =>
      model.busy !== null
        ? {}
        : {
            model: { busy: 'fork', problem: null },
            command: forkSession({ sessionId, afterTurnId: null }),
          },
    Retitled: () => ({ model: { busy: null, problem: null } }),
    Forked: ({ projectId, sessionId }) => ({
      model: { busy: null, problem: null },
      command: Router.push(session(projectId, sessionId)),
    }),
    Dismiss: (_, { model }) => ({ model: { ...model, problem: null } }),
    Refused: ({ reason }) => ({ model: { busy: null, problem: reason } }),
  },
});
