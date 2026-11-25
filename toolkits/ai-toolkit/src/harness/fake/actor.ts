import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { HARNESS_NAMES } from '../../contract/raw/index.js';
import {
  AgentQuestionSchema,
  BACKGROUND_JOB_KINDS,
} from '../../contract/wire/index.js';
import { SCRIPT_NAMES } from './scripts.js';

/*
 * The Agent fake: Claude Code and Codex as one computer has them, in a
 * Kabuki Actor that Requires nothing. Its Model is what the fake harnesses
 * play (serve.ts) and every reply they play, so the bubble shows each.
 *
 * - Replies    what the next reply plays (`replyWith`, a Script by name;
 *              `echo` says the message back). Each reply running is in
 *              `replies`, Sent by serve.ts as it starts and ends, with the
 *              question it waits on.
 * - Agents     the Agents open (Sent by serve.ts), each on the model and
 *              settings its latest Turn ran on, and their Background Jobs
 *              with what each wrote.
 * - Context    the Context Usage every Agent reports, and its limits.
 *
 * Blank: replies an echo. Claude Code and Codex are both installed and
 * signed in, as on a computer Code runs on (serve.ts). A reload keeps the
 * world but not what ran in it (index.ts's `kept`).
 */

const Harness = Schema.Literals(HARNESS_NAMES);
export type HarnessName = typeof Harness.Type;

const Script = Schema.Literals(SCRIPT_NAMES);

const Reply = Schema.Struct({
  id: Schema.String,
  /** The Native Id of the Agent it runs in. */
  agent: Schema.String,
  harness: Harness,
  /** What it was asked; empty for an Agent-started Turn. */
  prompt: Schema.String,
  script: Schema.String,
  startedBy: Schema.Literals(['You', 'Agent']),
  /** The Agent Question it waits on, or null. */
  question: Schema.NullOr(AgentQuestionSchema),
});
export type Reply = typeof Reply.Type;

const JobEnd = Schema.Literals(['done', 'failed', 'stopped']);

const Job = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  harness: Harness,
  kind: Schema.Literals(BACKGROUND_JOB_KINDS),
  title: Schema.String,
  /** The tool call that started it. */
  toolCallId: Schema.String,
  startedAt: Schema.Finite,
  /** What it wrote, piece by piece. */
  output: Schema.Array(Schema.String),
  /** How it ended, until serve.ts writes its end; null while it runs. */
  ending: Schema.NullOr(Schema.Struct({ how: JobEnd, summary: Schema.String })),
});
export type Job = typeof Job.Type;

const Model = Schema.Struct({
  /** The Script every reply from now on plays. */
  replyWith: Script,
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
  jobs: Schema.Array(Job),
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
  /** Every reply from now on plays this Script. */
  ReplyWith: { script: Script },

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
    script: Schema.String,
    startedBy: Schema.Literals(['You', 'Agent']),
    /** The model and settings it runs on, a Turn's changes taken. */
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
  },
  ReplyAsks: { id: Schema.String, question: AgentQuestionSchema },
  ReplyHeard: { id: Schema.String },
  ReplyEnded: { id: Schema.String },
  JobStarted: {
    id: Schema.String,
    agent: Schema.String,
    harness: Harness,
    kind: Schema.Literals(BACKGROUND_JOB_KINDS),
    title: Schema.String,
    toolCallId: Schema.String,
    startedAt: Schema.Finite,
    output: Schema.Array(Schema.String),
  },
  /** A job ends: its Script's time is up, or it was stopped. */
  JobEnded: { id: Schema.String, how: JobEnd, summary: Schema.String },
  JobGone: { id: Schema.String },
  ContextFilled: { usedTokens: Schema.Int },
});
export type AgentMessage = typeof Message.Type;

/** The Agent fake's Controls, in the bubble's order. */
export const AGENT_CONTROLS = ['ReplyWith'] as const satisfies ReadonlyArray<
  AgentMessage['_tag']
>;

/** Blank: replies an echo, nothing open. */
export const blank = (): AgentModel => ({
  replyWith: 'echo',
  agents: [],
  replies: [],
  jobs: [],
  context: {
    usedTokens: 24_000,
    maxTokens: 200_000,
    sessionPercent: 12,
    weeklyPercent: 31,
  },
});

/** `replies` with the one `id` names changed. */
const onReply = (
  model: AgentModel,
  id: string,
  change: (reply: Reply) => Partial<Reply>,
) => ({
  replies: model.replies.map((reply) =>
    reply.id === id ? { ...reply, ...change(reply) } : reply,
  ),
});

export const AgentFake = Actor.define('Agent', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    ReplyWith: ({ script }) => ({ model: { replyWith: script } }),

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
    // Its replies and Background Jobs go with it.
    AgentClosed: ({ id }, { model }) => ({
      model: {
        agents: model.agents.filter((agent) => agent.id !== id),
        replies: model.replies.filter(({ agent }) => agent !== id),
        jobs: model.jobs.filter(({ agent }) => agent !== id),
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
            script: reply.script,
            startedBy: reply.startedBy,
            question: null,
          },
        ],
      },
    }),
    ReplyAsks: ({ id, question }, { model }) => ({
      model: onReply(model, id, () => ({ question })),
    }),
    ReplyHeard: ({ id }, { model }) => ({
      model: onReply(model, id, () => ({ question: null })),
    }),
    ReplyEnded: ({ id }, { model }) => ({
      model: { replies: model.replies.filter((reply) => reply.id !== id) },
    }),
    JobStarted: (job, { model }) => ({
      model: {
        jobs: [
          ...model.jobs,
          {
            id: job.id,
            agent: job.agent,
            harness: job.harness,
            kind: job.kind,
            title: job.title,
            toolCallId: job.toolCallId,
            startedAt: job.startedAt,
            output: job.output,
            ending: null,
          },
        ],
      },
    }),
    // Only a job still running ends: a stopped one is not done again.
    JobEnded: ({ id, how, summary }, { model }) => ({
      model: {
        jobs: model.jobs.map((job) =>
          job.id === id && job.ending === null
            ? { ...job, ending: { how, summary } }
            : job,
        ),
      },
    }),
    JobGone: ({ id }, { model }) => ({
      model: { jobs: model.jobs.filter((job) => job.id !== id) },
    }),
    ContextFilled: ({ usedTokens }, { model }) => ({
      model: { context: { ...model.context, usedTokens } },
    }),
  },
});
