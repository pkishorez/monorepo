import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema } from '../../../../../../server/rpc/git/contract/index.js';
import { PackageContentsSchema } from '../../../../../../server/rpc/project/contract/index.js';
import { Monorepo } from '../../../../../../services/monorepo/contract/index.js';
import { UnchangedSchema } from '../../../../../logic/shared/index.js';

/*
 * One Package's view: its whole file tree at a branch, with what lies
 * outside its Source roots dimmed, and its file import graph as the tree's
 * links. The same for a Single Package and a Package entered from its
 * Monorepo.
 *
 * 1. Read   the Package's files, Source roots, imports and Check at the
 *           branch its Props name: with a monoverse.json, each import its
 *           rules forbid is a Violation, a broken link, checked on the
 *           server as `monoverse lint` checks it. Again whenever the branch
 *           changes, the tree staying as it is while the new one is read.
 * 2. Show   the tree, with the Source roots open. A double click on a file
 *           Emits `Opened`; viewing a folder Emits `Viewed`.
 */

const State = Schema.TaggedUnion({
  Reading: {},
  Failure: { at: Schema.String, problem: Schema.String },
  Contents: {
    /** The branch and try it was read at. */
    at: Schema.String,
    contents: PackageContentsSchema,
  },
});

export type State = typeof State.Type;

export const PackageShape = Actor.define('Package', {
  requires: [Monorepo],
  input: Schema.Struct({
    /** The project's folder, absolute. */
    root: Schema.String,
    /** The Package's folder, relative to it; `.` for a Single Package. */
    path: Schema.String,
    /** The Package's name, for its tree's root. */
    name: Schema.String,
  }),
  props: Schema.Struct({
    /** The branch to read; null: the folder as it is on disk. */
    branch: Schema.NullOr(Schema.String),
    /** What the branch changed since Compare-to; null while Changes is off. */
    changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
    /** How what it left unchanged is drawn, while Changes is on. */
    unchanged: UnchangedSchema,
    /** Whether the files outside the Source roots are drawn, dimmed. */
    ignored: Schema.Boolean,
  }),
  model: Schema.Struct({
    root: Schema.String,
    path: Schema.String,
    name: Schema.String,
    /** How many times it was asked to read again. */
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
