import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { HARNESS_NAMES } from '../../contract/raw/index.js';
import {
  AgentQuestionSchema,
  BACKGROUND_JOB_KINDS,
} from '../../contract/wire/index.js';
import { BUILT_IN_SKILLS } from './catalog.js';
import { SCRIPT_NAMES } from './scripts.js';

/*
 * The Agent fake: Claude Code and Codex as one computer has them, in a
 * Kabuki Actor that Requires nothing. Its Model is the world the fake
 * harnesses read (serve.ts) and every reply they play, so the bubble can
 * act on one.
 *
 * - Install    per harness: installed or not (and why not), its own login
 *              and the other config folders signed in, the binary paths
 *              that run, the config folder Connect's environment names,
 *              its Skills by folder, and what fails (models, Skills,
 *              opening an Agent).
 * - Replies    what the next reply plays (`replyWith`, a Script by name;
 *              `echo` says the message back) and how fast (`paceMs`).
 *              Each reply running is in `replies`, Sent by serve.ts as it
 *              starts and ends; a Control on one (ask now, fail now, cut
 *              off now, hang until stopped, give up asking) waits in its
 *              `now` until the reply takes it, between two of its steps.
 * - Agents     the Agents open (Sent by serve.ts), each on the model and
 *              settings its latest Turn ran on, their Background Jobs
 *              with what each wrote, and the Turns an agent was asked to
 *              start on its own (`wakeups`).
 * - One-shots  the next Title and Btw answer, or why the next fails.
 * - Context    the Context Usage every Agent reports, and its limits.
 *
 * Blank: Claude Code and Codex both installed and signed in, as on a
 * computer Code runs on, nothing failing, replies an echo. A reload keeps
 * the world but not what ran in it (index.ts's `kept`).
 */

const Harness = Schema.Literals(HARNESS_NAMES);
export type HarnessName = typeof Harness.Type;

const Install = Schema.Struct({
  installed: Schema.Boolean,
  /** Why it does not run while not installed; blank for the harness's own words. */
  notInstalledWhy: Schema.String,
  /** What its binary's `--version` prints. */
  version: Schema.String,
  /** Its own config folder (the environment's, else under home) holds a login. */
  signedIn: Schema.Boolean,
  /** Other config folders that hold a login, as given. */
  logins: Schema.Array(Schema.String),
  /** Paths besides PATH's that run as its binary. */
  binaries: Schema.Array(Schema.String),
  /** The config folder Connect's environment names (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`); null for none. */
  configFromEnvironment: Schema.NullOr(Schema.String),
  /** Its Skills, each in a folder and every folder under it; '' for everywhere. */
  skills: Schema.Array(
    Schema.Struct({
      folder: Schema.String,
      name: Schema.String,
      description: Schema.String,
    }),
  ),
  /** Why each fails, or null. */
  modelsFail: Schema.NullOr(Schema.String),
  skillsFail: Schema.NullOr(Schema.String),
  opensFail: Schema.NullOr(Schema.String),
  /** How long opening an Agent takes, in ms. */
  opensInMs: Schema.Int,
});
export type Install = typeof Install.Type;

const Script = Schema.Literals(SCRIPT_NAMES);

/** What a Control asks of a running reply, which it takes between two steps. */
const Now = Schema.TaggedUnion({
  /** Asks a question now. */
  Ask: {},
  /** Ends failed, saying this. */
  Fail: { reason: Schema.String },
  /** Its process exits: the stream fails. */
  CutOff: {},
  /** Stops answering until it is stopped. */
  Hang: {},
  /** Lets go of the question it waits on, as though nobody answered. */
  GiveUp: {},
});
export type Now = typeof Now.Type;

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
  hanging: Schema.Boolean,
  now: Schema.NullOr(Now),
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
  /** How a Control ended it, until serve.ts writes its end; null while it runs. */
  ending: Schema.NullOr(Schema.Struct({ how: JobEnd, summary: Schema.String })),
});
export type Job = typeof Job.Type;

const Model = Schema.Struct({
  claude: Install,
  codex: Install,
  /** The Script every reply from now on plays. */
  replyWith: Script,
  /** How long a reply waits between two pieces, in ms. */
  paceMs: Schema.Int,
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
  /** Turns an agent was asked to start on its own, waiting for it to be free. */
  wakeups: Schema.Array(
    Schema.Struct({ id: Schema.String, agent: Schema.String, script: Script }),
  ),
  /** Why stopping a Background Job fails, or null. */
  stopsFail: Schema.NullOr(Schema.String),
  /** Why answering an Agent Question fails, or null. */
  answersFail: Schema.NullOr(Schema.String),
  /** The next Title, blank for one from the message; why it fails instead. */
  title: Schema.Struct({
    next: Schema.String,
    failNext: Schema.NullOr(Schema.String),
    /** How long the next Title takes, in ms. */
    inMs: Schema.Int,
  }),
  /** The next Btw answer, blank for a plain one; why it fails instead. */
  btw: Schema.Struct({
    next: Schema.String,
    failNext: Schema.NullOr(Schema.String),
  }),
  context: Schema.Struct({
    usedTokens: Schema.Int,
    maxTokens: Schema.Int,
    /** The plan's limits, in percent used. */
    sessionPercent: Schema.Finite,
    weeklyPercent: Schema.Finite,
  }),
  /** Wakeups asked for so far, so no id repeats. */
  counted: Schema.Int,
});
export type AgentModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls: the harnesses.
  /** Installs a harness, its binary on PATH printing this version (blank keeps it). */
  Install: { harness: Harness, version: Schema.String },
  /** Uninstalls a harness: it does not run, saying why (blank for the harness's own words). */
  Uninstall: { harness: Harness, why: Schema.String },
  /** Signs a config folder in (blank for the harness's own). */
  SignIn: { harness: Harness, configFolder: Schema.String },
  /** Signs a config folder out (blank for the harness's own). */
  SignOut: { harness: Harness, configFolder: Schema.String },
  /** Puts a binary at this path that runs as the harness. */
  AddBinary: { harness: Harness, path: Schema.String },
  /** Connect's environment names this config folder for the harness (blank for none). */
  SetConfigFromEnvironment: { harness: Harness, folder: Schema.String },
  /** Adds a Skill in this folder and every folder under it (blank for everywhere). */
  AddSkill: {
    harness: Harness,
    folder: Schema.String,
    name: Schema.String,
    description: Schema.String,
  },
  /** Listing Skills fails, saying this (blank: works again). */
  SkillsFail: { harness: Harness, reason: Schema.String },
  /** Listing models fails, saying this (blank: works again). */
  ModelsFail: { harness: Harness, reason: Schema.String },
  /** Opening an Agent fails, saying this (blank: works again). */
  OpensFail: { harness: Harness, reason: Schema.String },
  /** Opening an Agent takes this long, in ms (0: at once again). */
  OpensSlowly: { harness: Harness, ms: Schema.Int },

  // Controls: replies.
  /** Every reply from now on plays this Script. */
  ReplyWith: { script: Script },
  /** Waits this long between two pieces of a reply, in ms. */
  SetPace: { ms: Schema.Int },
  /** The running reply (blank: the latest) asks a question now. */
  AskNow: { reply: Schema.String },
  /** The running reply (blank: the latest) fails now, saying this. */
  FailNow: { reply: Schema.String, reason: Schema.String },
  /** The running reply's (blank: the latest) harness process exits now. */
  CutOffNow: { reply: Schema.String },
  /** The running reply (blank: the latest) stops answering until it is stopped. */
  HangNow: { reply: Schema.String },
  /** The reply (blank: the latest) lets go of the question it waits on, unanswered. */
  GiveUpAsking: { reply: Schema.String },
  /** Answering a question fails, saying this (blank: works again). */
  AnswersFail: { reason: Schema.String },
  /** An open Agent (blank: the latest) starts a Turn on its own, once it is free. */
  StartTurnItself: { agent: Schema.String, script: Script },

  // Controls: Background Jobs.
  /** A Background Job (blank: the latest) writes this. */
  WriteJobOutput: { job: Schema.String, text: Schema.String },
  /** A Background Job (blank: the latest) ends, saying this. */
  EndJob: { job: Schema.String, how: JobEnd, summary: Schema.String },
  /** Stopping a Background Job fails, saying this (blank: works again). */
  StopsFail: { reason: Schema.String },

  // Controls: one-shots and context.
  /** The next Title written (blank: from the message). */
  TitleNext: { title: Schema.String },
  /** The next Title fails, saying this. */
  FailNextTitle: { reason: Schema.String },
  /** The next Title takes this long, in ms. */
  TitleSlowly: { ms: Schema.Int },
  /** The next Btw answer (blank: a plain one). */
  BtwNext: { answer: Schema.String },
  /** The next Btw fails, saying this. */
  FailNextBtw: { reason: Schema.String },
  /** How full every Agent's context is, and the plan's limits, in percent used. */
  SetContextUsage: {
    usedTokens: Schema.Int,
    maxTokens: Schema.Int,
    sessionPercent: Schema.Finite,
    weeklyPercent: Schema.Finite,
  },

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
  /** The reply took what `now` asked. */
  ReplyTook: { id: Schema.String },
  ReplyHangs: { id: Schema.String },
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
  JobGone: { id: Schema.String },
  WakeupTaken: { id: Schema.String },
  TitleTaken: {},
  BtwTaken: {},
  ContextFilled: { usedTokens: Schema.Int },
});
export type AgentMessage = typeof Message.Type;

/** The Agent fake's Controls, in the bubble's order. */
export const AGENT_CONTROLS = [
  'Install',
  'Uninstall',
  'SignIn',
  'SignOut',
  'AddBinary',
  'SetConfigFromEnvironment',
  'AddSkill',
  'SkillsFail',
  'ModelsFail',
  'OpensFail',
  'OpensSlowly',
  'ReplyWith',
  'SetPace',
  'AskNow',
  'FailNow',
  'CutOffNow',
  'HangNow',
  'GiveUpAsking',
  'AnswersFail',
  'StartTurnItself',
  'WriteJobOutput',
  'EndJob',
  'StopsFail',
  'TitleNext',
  'FailNextTitle',
  'TitleSlowly',
  'BtwNext',
  'FailNextBtw',
  'SetContextUsage',
] as const satisfies ReadonlyArray<AgentMessage['_tag']>;

const installed = (): Install => ({
  installed: true,
  notInstalledWhy: '',
  version: '',
  signedIn: true,
  logins: [],
  binaries: [],
  configFromEnvironment: null,
  skills: BUILT_IN_SKILLS.map(({ name, description }) => ({
    folder: '',
    name,
    description,
  })),
  modelsFail: null,
  skillsFail: null,
  opensFail: null,
  opensInMs: 0,
});

/** Blank: both harnesses installed and signed in, nothing failing, replies an echo. */
export const blank = (): AgentModel => ({
  claude: installed(),
  codex: installed(),
  replyWith: 'echo',
  paceMs: 300,
  agents: [],
  replies: [],
  jobs: [],
  wakeups: [],
  stopsFail: null,
  answersFail: null,
  title: { next: '', failNext: null, inMs: 0 },
  btw: { next: '', failNext: null },
  context: {
    usedTokens: 24_000,
    maxTokens: 200_000,
    sessionPercent: 12,
    weeklyPercent: 31,
  },
  counted: 0,
});

/** Blank text as null. */
const given = (text: string) => (text.trim() === '' ? null : text.trim());

/** The id given, or the latest of `ids` when blank. */
const pick = (id: string, ids: ReadonlyArray<string>) =>
  given(id) ?? ids.at(-1) ?? null;

/** `model` with one harness's Install changed. */
const install = (
  model: AgentModel,
  harness: HarnessName,
  change: Partial<Install>,
) => ({ [harness]: { ...model[harness], ...change } });

/** `replies` with the one `id` picks changed; the same when none. */
const onReply = (
  model: AgentModel,
  id: string,
  change: (reply: Reply) => Partial<Reply>,
) => {
  const found = pick(
    id,
    model.replies.map((reply) => reply.id),
  );
  return {
    replies: model.replies.map((reply) =>
      reply.id === found ? { ...reply, ...change(reply) } : reply,
    ),
  };
};

const onJob = (
  model: AgentModel,
  id: string,
  change: (job: Job) => Partial<Job>,
) => {
  const found = pick(
    id,
    model.jobs.filter((job) => job.ending === null).map((job) => job.id),
  );
  return {
    jobs: model.jobs.map((job) =>
      job.id === found ? { ...job, ...change(job) } : job,
    ),
  };
};

const without = (list: ReadonlyArray<string>, item: string) =>
  list.filter((each) => each !== item);

export const AgentFake = Actor.define('Agent', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    Install: ({ harness, version }, { model }) => ({
      model: install(model, harness, {
        installed: true,
        version: version.trim() || model[harness].version,
      }),
    }),
    Uninstall: ({ harness, why }, { model }) => ({
      model: install(model, harness, {
        installed: false,
        notInstalledWhy: why.trim(),
      }),
    }),
    SignIn: ({ harness, configFolder }, { model }) => {
      const folder = given(configFolder);
      return {
        model: install(
          model,
          harness,
          folder === null
            ? { signedIn: true }
            : {
                logins: [...without(model[harness].logins, folder), folder],
              },
        ),
      };
    },
    SignOut: ({ harness, configFolder }, { model }) => {
      const folder = given(configFolder);
      return {
        model: install(
          model,
          harness,
          folder === null
            ? { signedIn: false }
            : { logins: without(model[harness].logins, folder) },
        ),
      };
    },
    AddBinary: ({ harness, path }, { model }) => {
      const at = given(path);
      return at === null
        ? {}
        : {
            model: install(model, harness, {
              binaries: [...without(model[harness].binaries, at), at],
            }),
          };
    },
    SetConfigFromEnvironment: ({ harness, folder }, { model }) => ({
      model: install(model, harness, { configFromEnvironment: given(folder) }),
    }),
    AddSkill: ({ harness, folder, name, description }, { model }) => {
      const skill = given(name);
      return skill === null
        ? {}
        : {
            model: install(model, harness, {
              skills: [
                ...model[harness].skills,
                { folder: folder.trim(), name: skill, description },
              ],
            }),
          };
    },
    SkillsFail: ({ harness, reason }, { model }) => ({
      model: install(model, harness, { skillsFail: given(reason) }),
    }),
    ModelsFail: ({ harness, reason }, { model }) => ({
      model: install(model, harness, { modelsFail: given(reason) }),
    }),
    OpensFail: ({ harness, reason }, { model }) => ({
      model: install(model, harness, { opensFail: given(reason) }),
    }),
    OpensSlowly: ({ harness, ms }, { model }) => ({
      model: install(model, harness, { opensInMs: Math.max(0, ms) }),
    }),

    ReplyWith: ({ script }) => ({ model: { replyWith: script } }),
    SetPace: ({ ms }) => ({ model: { paceMs: Math.max(0, ms) } }),
    AskNow: ({ reply }, { model }) => ({
      model: onReply(model, reply, () => ({ now: { _tag: 'Ask' } })),
    }),
    FailNow: ({ reply, reason }, { model }) => ({
      model: onReply(model, reply, () => ({
        now: {
          _tag: 'Fail',
          reason: given(reason) ?? 'The agent stopped with an error.',
        },
      })),
    }),
    CutOffNow: ({ reply }, { model }) => ({
      model: onReply(model, reply, () => ({ now: { _tag: 'CutOff' } })),
    }),
    HangNow: ({ reply }, { model }) => ({
      model: onReply(model, reply, () => ({ now: { _tag: 'Hang' } })),
    }),
    GiveUpAsking: ({ reply }, { model }) => ({
      model: onReply(model, reply, () => ({ now: { _tag: 'GiveUp' } })),
    }),
    AnswersFail: ({ reason }) => ({ model: { answersFail: given(reason) } }),
    StartTurnItself: ({ agent, script }, { model }) => {
      const found = pick(
        agent,
        model.agents.map(({ id }) => id),
      );
      return found === null
        ? {}
        : {
            model: {
              counted: model.counted + 1,
              wakeups: [
                ...model.wakeups,
                { id: `wakeup-${model.counted + 1}`, agent: found, script },
              ],
            },
          };
    },

    WriteJobOutput: ({ job, text }, { model }) => ({
      model: onJob(model, job, ({ output }) => ({ output: [...output, text] })),
    }),
    EndJob: ({ job, how, summary }, { model }) => ({
      model: onJob(model, job, () => ({ ending: { how, summary } })),
    }),
    StopsFail: ({ reason }) => ({ model: { stopsFail: given(reason) } }),

    TitleNext: ({ title }, { model }) => ({
      model: { title: { ...model.title, next: title.trim() } },
    }),
    FailNextTitle: ({ reason }, { model }) => ({
      model: {
        title: {
          ...model.title,
          failNext: given(reason) ?? 'Codex could not write a title.',
        },
      },
    }),
    TitleSlowly: ({ ms }, { model }) => ({
      model: { title: { ...model.title, inMs: Math.max(0, ms) } },
    }),
    BtwNext: ({ answer }, { model }) => ({
      model: { btw: { ...model.btw, next: answer.trim() } },
    }),
    FailNextBtw: ({ reason }, { model }) => ({
      model: {
        btw: {
          ...model.btw,
          failNext: given(reason) ?? 'The agent could not answer.',
        },
      },
    }),
    SetContextUsage: (context) => ({
      model: {
        context: {
          usedTokens: context.usedTokens,
          maxTokens: context.maxTokens,
          sessionPercent: context.sessionPercent,
          weeklyPercent: context.weeklyPercent,
        },
      },
    }),

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
    // Its replies, Background Jobs and wakeups go with it.
    AgentClosed: ({ id }, { model }) => ({
      model: {
        agents: model.agents.filter((agent) => agent.id !== id),
        replies: model.replies.filter(({ agent }) => agent !== id),
        jobs: model.jobs.filter(({ agent }) => agent !== id),
        wakeups: model.wakeups.filter(({ agent }) => agent !== id),
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
            hanging: false,
            now: null,
          },
        ],
      },
    }),
    ReplyTook: ({ id }, { model }) => ({
      model: onReply(model, id, () => ({ now: null })),
    }),
    ReplyHangs: ({ id }, { model }) => ({
      model: onReply(model, id, () => ({ hanging: true })),
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
    JobGone: ({ id }, { model }) => ({
      model: { jobs: model.jobs.filter((job) => job.id !== id) },
    }),
    WakeupTaken: ({ id }, { model }) => ({
      model: { wakeups: model.wakeups.filter((wakeup) => wakeup.id !== id) },
    }),
    TitleTaken: () => ({
      model: { title: { next: '', failNext: null, inMs: 0 } },
    }),
    BtwTaken: () => ({ model: { btw: { next: '', failNext: null } } }),
    ContextFilled: ({ usedTokens }, { model }) => ({
      model: { context: { ...model.context, usedTokens } },
    }),
  },
});
