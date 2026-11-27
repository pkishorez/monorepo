import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Agent } from '../../../../../../../../../../services/agent/contract/index.js';
import { Preferences } from '../../../../../../../../../../services/preferences/contract/index.js';
import { ProjectRegistry } from '../../../../../../../../../../services/project-registry/contract/index.js';
import {
  Asking,
  Listed,
  Project,
  Remembered,
  Run,
  Worktree,
} from '../../../../../../logic/shared/index.js';

const Turn = Schema.Struct({
  ...Asking.fields,
  text: Schema.NullOr(Schema.String),
});

export type Turn = typeof Turn.Type;

export const ChatShape = Actor.define('Chat', {
  description:
    'Asks the Agent about the Kabuki Session in view, in the folder its code is in, with DevTools’ MCP tools to look at it and drive it',
  requires: [Agent, Preferences, ProjectRegistry],
  input: Schema.Struct({ name: Schema.String, app: Schema.String }),
  model: Schema.Struct({
    name: Schema.String,
    app: Schema.String,
    projects: Schema.NullOr(Schema.Array(Project)),
    listProblem: Schema.NullOr(Schema.String),
    worktrees: Schema.NullOr(Schema.Array(Worktree)),
    worktreesProblem: Schema.NullOr(Schema.String),
    threads: Schema.Array(Listed),
    thread: Schema.NullOr(Schema.String),
    turns: Schema.Array(Turn),
    run: Run,
    pending: Schema.NullOr(Asking),
    problem: Schema.NullOr(Schema.String),
  }),
  state: Schema.TaggedUnion({
    Recall: {},
    Choice: {},
    Open: { project: Schema.String, folder: Schema.String },
  }),
  message: {
    Recalled: { remembered: Schema.NullOr(Remembered) },
    Listed: { projects: Schema.Array(Project) },
    ListRefused: { problem: Schema.String },
    Relisted: Schema.Struct({}).annotate({
      description: 'Read the Project registry again after it could not be read',
    }),
    Chose: Schema.Struct({ project: Schema.String }).annotate({
      description:
        "Pick the registered Project this app's code is in, by its path; its current Worktree is asked in, and both are remembered for this app",
    }),
    WorktreesListed: { worktrees: Schema.Array(Worktree) },
    WorktreesRefused: { problem: Schema.String },
    WorktreesRelisted: Schema.Struct({}).annotate({
      description:
        "Read the Project's Worktrees again after they could not be read",
    }),
    Switched: Schema.Struct({ folder: Schema.String }).annotate({
      description:
        "Ask in another Worktree of the Project, by the Project's folder in it; it is remembered for this app",
    }),
    Threaded: { threads: Schema.Array(Listed) },
    Opened: Schema.Struct({ thread: Schema.NullOr(Schema.String) }).annotate({
      description:
        'Open one of the chats in this Worktree, or null for a new one',
    }),
    Asked: Schema.Struct({ question: Schema.String }).annotate({
      description:
        'Ask the Agent, which reaches this Kabuki Session through DevTools’ MCP tools, in the open chat or a new one',
    }),
    Started: { thread: Schema.String },
    Refused: { problem: Schema.String },
    Watched: { turns: Schema.Array(Turn), run: Run },
    Lost: {},
    Stopped: Schema.Struct({}).annotate({
      description: 'Stop the answer the Agent is working on',
    }),
    Retried: Schema.Struct({}).annotate({
      description: 'Ask the last question again, after it failed',
    }),
  },
});
