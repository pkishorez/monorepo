import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ProjectEntrySchema } from '../../../server/rpc/projects/contract/index.js';
import { Projects } from '../../../services/projects/contract/index.js';

export const UnchangedSchema = Schema.Literals(['show', 'dim', 'hide']);
export type Unchanged = typeof UnchangedSchema.Type;

export const ConnectionKindSchema = Schema.Literals([
  'violations',
  'exceptions',
  'allowed',
]);
export type ConnectionKind = typeof ConnectionKindSchema.Type;

export const ShownSchema = Schema.Struct({
  violations: Schema.Boolean,
  exceptions: Schema.Boolean,
  allowed: Schema.Boolean,
});
export type Shown = typeof ShownSchema.Type;

const Where = {
  package: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
  changes: Schema.Boolean,
};

export const PlaceSchema = Schema.Struct({
  project: Schema.NullOr(Schema.String),
  ...Where,
});
export type Place = typeof PlaceSchema.Type;

const State = Schema.TaggedUnion({
  Picking: {},
  Finding: { project: Schema.String },
  Showing: {
    project: Schema.String,
    root: Schema.String,
  },
});
export type State = typeof State.Type;

const Model = Schema.Struct({
  projects: Schema.NullOr(Schema.Array(ProjectEntrySchema)),
  projectsProblem: Schema.NullOr(Schema.String),
  ...Where,
  deleted: Schema.Boolean,
  unchanged: UnchangedSchema,
  ignored: Schema.Boolean,
  shown: ShownSchema,
  outside: Schema.Boolean,
  switching: Schema.Boolean,
});
export type Model = typeof Model.Type;

export const MonoverseShape = Actor.define('Monoverse', {
  requires: [Projects],
  input: PlaceSchema,
  props: Schema.UndefinedOr(
    Schema.Struct({ ...PlaceSchema.fields, reloads: Schema.Number }),
  ),
  model: Model,
  state: State,
  message: {
    Listed: { projects: Schema.Array(ProjectEntrySchema) },
    ListRefused: { problem: Schema.String },
    Followed: { place: PlaceSchema },
    SwitchAsked: {},
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
    Moved: Where,
    DeletedToggled: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    IgnoredToggled: {},
    ShownToggled: Schema.Struct({ kind: ConnectionKindSchema }).annotate({
      description:
        'Draw, or stop drawing, one kind of Connection: Violations, Exceptions, or every other import',
    }),
    OutsideToggled: Schema.Struct({}).annotate({
      description:
        'With one folder shown alone, draw or hide the folders outside it that it connects to',
    }),
  },
  emits: { Moved: PlaceSchema.fields },
});
