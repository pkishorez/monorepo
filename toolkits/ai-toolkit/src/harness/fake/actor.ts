import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { HARNESS_NAMES } from '../../contract/raw/index.js';
import { RECORDING_NAMES } from './recordings/index.js';

/*
 * The Agent fake: Claude Code and Codex as one computer has them, in a
 * Kabuki Actor that Requires nothing. Its Model is what the fake harnesses
 * replay (serve.ts) and every reply replaying, so the bubble shows each.
 *
 * - Replies    what the next reply replays (`replyWith`: a recording by
 *              name, or `random`, one of its harness's at random). Each
 *              reply running is in `replies`, Sent by serve.ts as it starts
 *              and ends.
 * - Agents     the Agents open (Sent by serve.ts), each on the model and
 *              settings its latest Turn ran on.
 * - Context    the Context Usage every Agent reports, and its limits.
 *
 * Blank: a random recording. Claude Code and Codex are both installed and
 * signed in, as on a computer Code runs on (serve.ts). A reload keeps the
 * world but not what ran in it (index.ts's `kept`).
 */

const Harness = Schema.Literals(HARNESS_NAMES);
export type HarnessName = typeof Harness.Type;

const RecordingName = Schema.Literals(RECORDING_NAMES);

const Reply = Schema.Struct({
  id: Schema.String,
  /** The Native Id of the Agent it runs in. */
  agent: Schema.String,
  harness: Harness,
  /** What it was asked. */
  prompt: Schema.String,
  /** The recording it replays. */
  recording: Schema.String,
});
export type Reply = typeof Reply.Type;

const Model = Schema.Struct({
  /** What every reply from now on replays. */
  replyWith: RecordingName,
  /** The Agents open, each with the model and settings its latest Turn runs on. */
  agents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      harness: Harness,
      cwd: Schema.String,
      model: Schema.String,
      settings: Schema.Record(Schema.String, Schema.String),
    }),
  ),
  replies: Schema.Array(Reply),
  context: Schema.Struct({
    usedTokens: Schema.Int,
    maxTokens: Schema.Int,
    /** The plan's limits, in percent used. */
    sessionPercent: Schema.Finite,
    weeklyPercent: Schema.Finite,
  }),
});
export type AgentModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** Every reply from now on replays this recording, or a random one. */
  ReplyWith: { recording: RecordingName },

  // Sent by serve.ts, for what the harnesses do.
  AgentOpened: {
    id: Schema.String,
    harness: Harness,
    cwd: Schema.String,
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
  },
  AgentClosed: { id: Schema.String },
  ReplyStarted: {
    id: Schema.String,
    agent: Schema.String,
    harness: Harness,
    prompt: Schema.String,
    recording: Schema.String,
    /** The model and settings it runs on, a Turn's changes taken. */
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
  },
  ReplyEnded: { id: Schema.String },
});
export type AgentMessage = typeof Message.Type;

/** The Agent fake's Controls, in the bubble's order. */
export const AGENT_CONTROLS = ['ReplyWith'] as const satisfies ReadonlyArray<
  AgentMessage['_tag']
>;

/** Blank: a random recording, nothing open. */
export const blank = (): AgentModel => ({
  replyWith: 'random',
  agents: [],
  replies: [],
  context: {
    usedTokens: 24_000,
    maxTokens: 200_000,
    sessionPercent: 12,
    weeklyPercent: 31,
  },
});

export const AgentFake = Actor.define('Agent', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    ReplyWith: ({ recording }) => ({ model: { replyWith: recording } }),

    AgentOpened: (agent, { model }) => ({
      model: {
        agents: [
          ...model.agents.filter(({ id }) => id !== agent.id),
          {
            id: agent.id,
            harness: agent.harness,
            cwd: agent.cwd,
            model: agent.model,
            settings: agent.settings,
          },
        ],
      },
    }),
    // Its replies go with it.
    AgentClosed: ({ id }, { model }) => ({
      model: {
        agents: model.agents.filter((agent) => agent.id !== id),
        replies: model.replies.filter(({ agent }) => agent !== id),
      },
    }),
    // A Turn's model and settings hold from it on: its Agent runs on them now.
    ReplyStarted: (reply, { model }) => ({
      model: {
        agents: model.agents.map((agent) =>
          agent.id === reply.agent
            ? { ...agent, model: reply.model, settings: reply.settings }
            : agent,
        ),
        replies: [
          ...model.replies,
          {
            id: reply.id,
            agent: reply.agent,
            harness: reply.harness,
            prompt: reply.prompt,
            recording: reply.recording,
          },
        ],
      },
    }),
    ReplyEnded: ({ id }, { model }) => ({
      model: { replies: model.replies.filter((reply) => reply.id !== id) },
    }),
  },
});
