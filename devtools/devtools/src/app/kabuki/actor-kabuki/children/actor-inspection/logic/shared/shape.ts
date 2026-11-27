import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Sessions } from '../../../../../services/sessions/contract/index.js';

export const storyKeyOf = (app: string) => `kabuki:story:${app}`;

export const Project = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});

export const Worktree = Schema.Struct({
  folder: Schema.String,
  branch: Schema.NullOr(Schema.String),
  head: Schema.String,
  primary: Schema.Boolean,
  current: Schema.Boolean,
});

export const Asking = Schema.Struct({
  question: Schema.String,
  chips: Schema.Array(Schema.String),
});

export const Run = Schema.Struct({
  status: Schema.Literals(['idle', 'running', 'done', 'failed', 'cancelled']),
  reason: Schema.NullOr(Schema.String),
  since: Schema.Number,
  activity: Schema.Array(Schema.String),
});

export const Listed = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  createdAt: Schema.Number,
});

export const Remembered = Schema.Struct({
  project: Schema.String,
  folder: Schema.String,
  thread: Schema.NullOr(Schema.String),
});

export type Project = typeof Project.Type;
export type Worktree = typeof Worktree.Type;
export type Asking = typeof Asking.Type;
export type Run = typeof Run.Type;

export const IDLE: Run = {
  status: 'idle',
  reason: null,
  since: 0,
  activity: [],
};

const Tab = Schema.Literals(['inspector', 'story']);

export const InspectionShape = Actor.define('Inspection', {
  description:
    'One Kabuki Session reached through the DevTools Server, shown as its Inspector or its Story',
  requires: [Sessions],
  input: Schema.Struct({ name: Schema.String, app: Schema.String }),
  props: Schema.UndefinedOr(Schema.Struct({ tab: Tab })),
  model: Schema.Struct({ name: Schema.String, app: Schema.String }),
});
