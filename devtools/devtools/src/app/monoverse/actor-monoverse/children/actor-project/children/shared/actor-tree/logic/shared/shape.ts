import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema } from '../../../../../../../../server/rpc/git/contract/index.js';
import {
  CheckSchema,
  ImportSchema,
} from '../../../../../../../../server/rpc/project/contract/index.js';
import { UnchangedSchema } from '../../../../../../../logic/shared/index.js';

const TreePackageSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
  version: Schema.optional(Schema.String),
  check: CheckSchema,
});

export type TreePackage = typeof TreePackageSchema.Type;

const BrokenLinkSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.optional(Schema.String),
  line: Schema.optional(Schema.Number),
  column: Schema.optional(Schema.Number),
  message: Schema.String,
});

export type BrokenLink = typeof BrokenLinkSchema.Type;

export interface Findings {
  readonly violations: ReadonlyMap<string, number>;
  readonly cycles: ReadonlyMap<string, number>;
  readonly checks: ReadonlyMap<string, TreePackage['check']>;
}

export interface Finding {
  readonly message: string;
  readonly where: string;
}

const TreePropsSchema = Schema.Struct({
  base: Schema.String,
  name: Schema.String,
  files: Schema.Array(Schema.String),
  packages: Schema.Array(TreePackageSchema),
  links: Schema.Array(ImportSchema),
  broken: Schema.Array(BrokenLinkSchema),
  sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
  changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
  unchanged: UnchangedSchema,
  ignored: Schema.Boolean,
});

export type TreeProps = typeof TreePropsSchema.Type;

export const TreeShape = Actor.define('Tree', {
  input: Schema.Struct({
    open: Schema.Array(Schema.String),
  }),
  props: TreePropsSchema,
  model: Schema.Struct({
    open: Schema.Array(Schema.String),
    home: Schema.Array(Schema.String),
    selected: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Toggled: { path: Schema.String },
    OpenChosen: { open: Schema.Array(Schema.String) },
    Reset: {},
    Selected: { path: Schema.NullOr(Schema.String) },
    Revealed: { folders: Schema.Array(Schema.String) },
    Opened: { path: Schema.String },
    Entered: { path: Schema.String },
    Viewed: { path: Schema.String, files: Schema.Array(Schema.String) },
  }),
  emits: {
    Opened: { path: Schema.String },
    Entered: { path: Schema.String },
    Viewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
  },
});
