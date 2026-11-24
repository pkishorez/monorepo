import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangeStatusSchema,
  FileDiffSchema,
} from '../../../../../../server/rpc/git/contract/index.js';
import { Monorepo } from '../../../../../../services/monorepo/contract/index.js';

/*
 * One file, opened from the tree, as the branch has it: its text, or
 * while Changes is on and the branch changed it since Compare-to, its
 * diff. A deleted file is only its diff. Closing it Emits `Closed`.
 */

const FileModel = Schema.Struct({
  /** The project's folder, absolute. */
  root: Schema.String,
  /** The branch read; null: the folder as it is on disk. */
  branch: Schema.NullOr(Schema.String),
  path: Schema.String,
  /** Compare-to, while Changes is on; null otherwise. */
  base: Schema.NullOr(Schema.String),
  /** How the branch changed the file since Compare-to, if it did. */
  status: Schema.NullOr(ChangeStatusSchema),
  /**
   * Shown beside a folder's list, which has its own close: closing goes
   * back to the list, and only a phone, showing one at a time, offers it.
   */
  inside: Schema.Boolean,
});

export type Model = typeof FileModel.Type;

export const FileViewerShape = Actor.define('FileViewer', {
  requires: [Monorepo],
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
