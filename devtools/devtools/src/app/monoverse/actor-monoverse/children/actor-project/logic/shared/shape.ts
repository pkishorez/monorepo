import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  BranchesSchema,
  ChangedPathSchema,
} from '../../../../../server/rpc/git/contract/index.js';
import {
  ImportSchema,
  WorkspaceSchema,
} from '../../../../../server/rpc/project/contract/index.js';
import { Projects } from '../../../../../services/projects/contract/index.js';
import { UnchangedSchema } from '../../../../logic/shared/index.js';

const WhereSchema = Schema.Struct({
  package: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
  changes: Schema.Boolean,
});
export type Where = typeof WhereSchema.Type;

const Analysed = {
  at: Schema.String,
  workspace: WorkspaceSchema,
};

const State = Schema.TaggedUnion({
  Opening: {},
  Failure: {
    at: Schema.String,
    problem: Schema.String,
    missing: Schema.Boolean,
  },
  Monorepo: {
    ...Analysed,
    links: Schema.Array(ImportSchema),
    cycles: Schema.Array(ImportSchema),
  },
  Package: Analysed,
});

export type Check = (typeof WorkspaceSchema.Type)['packages'][number]['check'];

const OpenSchema = Schema.TaggedUnion({
  File: { path: Schema.String, package: Schema.NullOr(Schema.String) },
  Folder: {
    path: Schema.String,
    package: Schema.NullOr(Schema.String),
    files: Schema.Array(Schema.String),
    sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
  },
});

const Model = Schema.Struct({
  root: Schema.String,
  branches: Schema.NullOr(BranchesSchema),
  gitProblem: Schema.NullOr(Schema.String),
  changed: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      files: Schema.Array(ChangedPathSchema),
    }),
  ),
  changesProblem: Schema.NullOr(Schema.String),
  open: Schema.NullOr(OpenSchema),
  reloads: Schema.Number,
});

export const ProjectShape = Actor.define('Project', {
  requires: [Projects],
  input: Schema.Struct({
    root: Schema.String,
  }),
  props: Schema.Struct({
    name: Schema.NullOr(Schema.String),
    ...WhereSchema.fields,
    deleted: Schema.Boolean,
    unchanged: UnchangedSchema,
    ignored: Schema.Boolean,
  }),
  model: Model,
  state: State,
  message: Schema.TaggedUnion({
    Analysed: {
      at: Schema.String,
      workspace: WorkspaceSchema,
      links: Schema.Array(ImportSchema),
      cycles: Schema.Array(ImportSchema),
    },
    AnalyseRefused: {
      at: Schema.String,
      problem: Schema.String,
      missing: Schema.Boolean,
    },
    Retried: {},
    BranchesRead: { branches: BranchesSchema },
    BranchesRefused: { problem: Schema.String },
    BranchChosen: { branch: Schema.String },
    BaseChosen: { base: Schema.String },
    ChangesToggled: {},
    DeletedToggled: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    IgnoredToggled: {},
    ChangesRead: { at: Schema.String, files: Schema.Array(ChangedPathSchema) },
    ChangesRefused: { at: Schema.String, problem: Schema.String },
    Entered: { package: Schema.String },
    Left: {},
    Followed: { package: Schema.NullOr(Schema.String) },
    FileOpened: { path: Schema.String },
    FolderViewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
    ViewClosed: {},
    SwitchAsked: {},
  }),
  emits: {
    Moved: WhereSchema.fields,
    DeletedToggled: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    IgnoredToggled: {},
    SwitchAsked: {},
  },
});
