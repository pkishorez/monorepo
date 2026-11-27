import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema } from '../../../../../../../server/rpc/git/contract/index.js';
import { PackageContentsSchema } from '../../../../../../../server/rpc/project/contract/index.js';
import { Projects } from '../../../../../../../services/projects/contract/index.js';
import {
  ShownSchema,
  UnchangedSchema,
} from '../../../../../../logic/shared/index.js';

const State = Schema.TaggedUnion({
  Reading: {},
  Failure: { at: Schema.String, problem: Schema.String },
  Contents: {
    at: Schema.String,
    contents: PackageContentsSchema,
  },
});

export type State = typeof State.Type;

export const PackageShape = Actor.define('Package', {
  requires: [Projects],
  input: Schema.Struct({
    root: Schema.String,
    path: Schema.String,
    name: Schema.String,
  }),
  props: Schema.Struct({
    branch: Schema.NullOr(Schema.String),
    changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
    unchanged: UnchangedSchema,
    ignored: Schema.Boolean,
    shown: ShownSchema,
    outside: Schema.Boolean,
  }),
  model: Schema.Struct({
    root: Schema.String,
    path: Schema.String,
    name: Schema.String,
    tries: Schema.Number,
  }),
  state: State,
  message: Schema.TaggedUnion({
    Read: {
      at: Schema.String,
      contents: PackageContentsSchema,
    },
    Refused: { at: Schema.String, problem: Schema.String },
    Retried: {},
    Opened: { path: Schema.String },
    Viewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
  }),
  emits: {
    Opened: { path: Schema.String },
    Viewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
  },
});
