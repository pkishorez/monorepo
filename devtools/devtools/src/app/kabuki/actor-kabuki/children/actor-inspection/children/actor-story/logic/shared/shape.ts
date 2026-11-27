import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { KabukiSession, Plan } from '@kestack/devtools-kabuki/devtools';
import { Agent } from '../../../../../../../../services/agent/contract/index.js';
import { Preferences } from '../../../../../../../../services/preferences/contract/index.js';
import { ProjectRegistry } from '../../../../../../../../services/project-registry/contract/index.js';

const Project = Schema.Struct({ name: Schema.String, path: Schema.String });

const Worktree = Schema.Struct({
  folder: Schema.String,
  branch: Schema.NullOr(Schema.String),
  head: Schema.String,
  primary: Schema.Boolean,
  current: Schema.Boolean,
});

const Shown = Schema.Struct({
  actor: Schema.String,
  lit: Schema.Array(Schema.String),
});

const Explored = Schema.Struct({
  ...Shown.fields,
  open: Schema.optionalKey(Schema.Array(Schema.String)),
});

const Link = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  label: Schema.optionalKey(Schema.String),
});

const Beat = Schema.Struct({
  say: Schema.String,
  focus: Schema.String,
  show: Schema.Array(Shown),
  links: Schema.optionalKey(Schema.Array(Link)),
});

export const Answer = Schema.Struct({
  title: Schema.String,
  beats: Schema.Array(Beat),
});

const Asking = Schema.Struct({
  question: Schema.String,
  chips: Schema.Array(Schema.String),
});

const Turn = Schema.Struct({
  ...Asking.fields,
  answer: Schema.NullOr(Answer),
  text: Schema.NullOr(Schema.String),
});

const Status = Schema.Literals([
  'idle',
  'running',
  'done',
  'failed',
  'cancelled',
]);

const Run = Schema.Struct({
  status: Status,
  reason: Schema.NullOr(Schema.String),
  since: Schema.Number,
  activity: Schema.Array(Schema.String),
});

export const IDLE: typeof Run.Type = {
  status: 'idle',
  reason: null,
  since: 0,
  activity: [],
};

const Listed = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  createdAt: Schema.Number,
});

const At = Schema.Struct({ turn: Schema.Number, beat: Schema.Number });

export const Remembered = Schema.Struct({
  project: Schema.String,
  folder: Schema.String,
  thread: Schema.NullOr(Schema.String),
});

export type Shown = typeof Shown.Type;
export type Explored = typeof Explored.Type;
export type Link = typeof Link.Type;
export type Asking = typeof Asking.Type;
export type Turn = typeof Turn.Type;
export type Run = typeof Run.Type;
export type At = typeof At.Type;
export type Project = typeof Project.Type;
export type Worktree = typeof Worktree.Type;

export const StoryShape = Actor.define('Story', {
  description:
    'Asks the Agent how the app works, about the folder its code is in, and plays each answer as Beats on its Blueprint',
  requires: [Agent, KabukiSession, ProjectRegistry, Preferences],
  input: Schema.Struct({ app: Schema.String }),
  props: Schema.UndefinedOr(Schema.Struct({ shown: Schema.Boolean })),
  model: Schema.Struct({
    app: Schema.String,
    projects: Schema.NullOr(Schema.Array(Project)),
    listProblem: Schema.NullOr(Schema.String),
    worktrees: Schema.NullOr(Schema.Array(Worktree)),
    worktreesProblem: Schema.NullOr(Schema.String),
    plan: Schema.NullOr(Plan),
    planProblem: Schema.NullOr(Schema.String),
    live: Schema.Array(Schema.String),
    threads: Schema.Array(Listed),
    thread: Schema.NullOr(Schema.String),
    turns: Schema.Array(Turn),
    run: Run,
    sent: Schema.NullOr(Schema.String),
    pending: Schema.NullOr(Asking),
    problem: Schema.NullOr(Schema.String),
    chips: Schema.Array(Schema.String),
    at: Schema.NullOr(At),
    playing: Schema.Boolean,
    explore: Schema.NullOr(Schema.Array(Explored)),
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
    Planned: { plan: Plan },
    PlanRefused: { problem: Schema.String },
    Replanned: Schema.Struct({}).annotate({
      description: "Read the app's Blueprint again after it could not be read",
    }),
    Lived: { paths: Schema.Array(Schema.String) },
    Chose: Schema.Struct({ project: Schema.String }).annotate({
      description:
        "Pick the registered Project this app's code is in, by its path; its current Worktree is asked about, and both are remembered for this app",
    }),
    WorktreesListed: { worktrees: Schema.Array(Worktree) },
    WorktreesRefused: { problem: Schema.String },
    WorktreesRelisted: Schema.Struct({}).annotate({
      description:
        "Read the Project's Worktrees again after they could not be read",
    }),
    Switched: Schema.Struct({ folder: Schema.String }).annotate({
      description:
        "Ask about another Worktree of the Project, by the Project's folder in it; it is remembered for this app",
    }),
    Threaded: { threads: Schema.Array(Listed) },
    Opened: Schema.Struct({ thread: Schema.NullOr(Schema.String) }).annotate({
      description:
        'Open one of the Threads about this Worktree, or null for a new one',
    }),
    Asked: Schema.Struct({ question: Schema.String }).annotate({
      description:
        'Ask the Agent a question with the chips added; in the open Thread, or a new one',
    }),
    Started: { thread: Schema.String },
    Refused: { problem: Schema.String },
    Watched: { turns: Schema.Array(Turn), run: Run },
    Lost: {},
    Stopped: Schema.Struct({}).annotate({
      description: 'Stop the answer the Agent is working on',
    }),
    Retried: Schema.Struct({}).annotate({
      description:
        'Ask the last question again, with the whole Blueprint, after it failed',
    }),
    Chipped: Schema.Struct({ chip: Schema.String }).annotate({
      description:
        'Add an actor or one of its parts, as `App/list · state:Open`, to the next question',
    }),
    Unchipped: Schema.Struct({ chip: Schema.String }).annotate({
      description: 'Take a chip off the next question',
    }),
    Stepped: Schema.Struct({ by: Schema.Number }).annotate({
      description: 'Go to the next Beat with 1, or the one before with -1',
    }),
    Jumped: Schema.Struct({
      turn: Schema.Number,
      beat: Schema.Number,
    }).annotate({
      description: 'Show one Beat of any answer, counted from 0',
    }),
    Played: Schema.Struct({ playing: Schema.Boolean }).annotate({
      description:
        'Play the Beats one after another, each for as long as it takes to read, or pause',
    }),
    Advanced: {},
    Explored: Schema.Struct({}).annotate({
      description:
        "Leave the story for Explore mode, starting from the picture of the Beat it is on, to open any card's parts by hand",
    }),
    Toggled: Schema.Struct({
      actor: Schema.String,
      ref: Schema.String,
    }).annotate({
      description:
        'Light or unlight one row of a card by its ref, as `model.done`, `worker:load` or `state:Ready`; leaves the story for Explore mode',
    }),
    Folded: Schema.Struct({
      actor: Schema.String,
      state: Schema.String,
    }).annotate({
      description:
        'Expand or collapse one State on a card; leaves the story for Explore mode',
    }),
    Returned: Schema.Struct({}).annotate({
      description:
        'Go back to the story at the Beat it is on, the canvas following its Beats again',
    }),
  },
});
