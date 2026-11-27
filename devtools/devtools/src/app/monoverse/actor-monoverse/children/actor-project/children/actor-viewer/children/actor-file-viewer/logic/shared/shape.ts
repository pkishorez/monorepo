import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangeStatusSchema,
  FileDiffSchema,
} from '../../../../../../../../../server/rpc/git/contract/index.js';
import { Projects } from '../../../../../../../../../services/projects/contract/index.js';

const FileModel = Schema.Struct({
  root: Schema.String,
  branch: Schema.NullOr(Schema.String),
  path: Schema.String,
  base: Schema.NullOr(Schema.String),
  status: Schema.NullOr(ChangeStatusSchema),
  besideFolderList: Schema.Boolean,
});

export type Model = typeof FileModel.Type;

export const FileViewerShape = Actor.define('FileViewer', {
  requires: [Projects],
  input: FileModel,
  model: FileModel,
  state: Schema.TaggedUnion({
    Loading: {},
    Failure: { problem: Schema.String },
    Text: { content: Schema.String, binary: Schema.Boolean },
    Diff: { diff: FileDiffSchema, content: Schema.NullOr(Schema.String) },
  }),
  message: Schema.TaggedUnion({
    Read: { content: Schema.String, binary: Schema.Boolean },
    Diffed: { diff: FileDiffSchema, content: Schema.NullOr(Schema.String) },
    Refused: { problem: Schema.String },
    Closed: {},
  }),
  emits: { Closed: {} },
});
