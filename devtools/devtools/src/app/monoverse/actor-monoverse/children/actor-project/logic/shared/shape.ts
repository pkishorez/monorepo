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

/*
 * Project: one saved project open, at the branch its holder names. Where
 * it is (the Package entered, the branch, Compare to, Changes) comes as
 * Props; every move the user makes in it is Emitted as where it moves to,
 * and comes back that way.
 *
 * 1. Analyse  the project at the branch: a Monorepo opens its tree, a
 *             Single Package straight its Package. Another branch is
 *             analysed again, the views staying on screen meanwhile; a
 *             project that cannot be read says why, and is read again
 *             when asked.
 * 2. Git      the branches as the project opens: which one its folder is
 *             on, and what Compare to starts at. A branch or Compare to
 *             the Props do not name is that one. While Changes is on,
 *             what the branch changed since Compare-to is read, and handed
 *             down to colour the tree; the files it deleted are drawn
 *             unless they are left out, here or in a folder looked into;
 *             what it left unchanged is drawn as it is, faded (the
 *             default) or not at all. A Package's files outside its
 *             Source roots are drawn dimmed, unless they are left out.
 *             Choosing a branch or Compare to, or turning Changes on or
 *             off, Emits `Moved`; how the trees are drawn comes as Props
 *             too, and a change to it is Emitted.
 * 3. Enter    a Package of the Monorepo, by a double click on it or from
 *             the Package menu, which goes back to the Monorepo's tree
 *             too: it Emits `Moved`, and the Package named back in the
 *             Props opens in the tree's place. The tree stays as it was
 *             beneath it, for when the Props name none again.
 * 4. View     a file opens in a dialog over the tree, as the branch has
 *             it, or as its diff while Changes is on and the branch changed
 *             it; a folder, the root included, opens there as the list of
 *             its files, what changed in it marked while Changes is on,
 *             drawn by the tree's settings, which it changes too. One of
 *             the two at a time, closed as another Package is shown. A
 *             Package viewed from the Monorepo's tree is viewed for its
 *             changes: Changes turns on if it is off, and the folder opens
 *             once they are read.
 * 5. Switch   the project's crumb, or a project that cannot be opened,
 *             Emits `SwitchAsked`, for the picker.
 */

/** Where in the project the user is, as its holder names it. */
const WhereSchema = Schema.Struct({
  /** The Package of a Monorepo entered, by its folder; null: the Monorepo's tree. */
  package: Schema.NullOr(Schema.String),
  /** The branch shown; null: the one the project's folder is on. */
  branch: Schema.NullOr(Schema.String),
  /** The branch compared to; null: `main`, else `master`, else `develop`. */
  base: Schema.NullOr(Schema.String),
  /** Whether what the branch changed since Compare-to is coloured. */
  changes: Schema.Boolean,
});
export type Where = typeof WhereSchema.Type;

/** An analysis, and what it was read at: the branch, and how many reloads. */
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
  /** A Single Package. */
  Package: Analysed,
});

/** What a Package's monoverse.json makes of it, as the Package lists mark it. */
export type Check = (typeof WorkspaceSchema.Type)['packages'][number]['check'];

/** What is open over the tree, and in which Package it was opened. */
const OpenSchema = Schema.TaggedUnion({
  File: { path: Schema.String, package: Schema.NullOr(Schema.String) },
  /** A folder, and every file in it. */
  Folder: {
    path: Schema.String,
    package: Schema.NullOr(Schema.String),
    files: Schema.Array(Schema.String),
    /** The Source roots of the Package it is in; null: none ignored. */
    sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
  },
});

const Model = Schema.Struct({
  /** The project's folder, absolute. */
  root: Schema.String,
  /** The repository's branches; null until read. */
  branches: Schema.NullOr(BranchesSchema),
  /** Why they could not be read: not a git repository, say. */
  gitProblem: Schema.NullOr(Schema.String),
  /** What the branch changed since Compare-to, and what it was read at. */
  changed: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      files: Schema.Array(ChangedPathSchema),
    }),
  ),
  changesProblem: Schema.NullOr(Schema.String),
  /** The file or folder open over the tree; null: none. */
  open: Schema.NullOr(OpenSchema),
  /** How many times the project was asked to be read again. */
  reloads: Schema.Number,
});

export const ProjectShape = Actor.define('Project', {
  requires: [Projects],
  input: Schema.Struct({
    /** The project's folder, absolute. */
    root: Schema.String,
  }),
  props: Schema.Struct({
    /** The name it was saved by; null: not saved. */
    name: Schema.NullOr(Schema.String),
    ...WhereSchema.fields,
    /** Whether the files the branch deleted are drawn, and listed. */
    deleted: Schema.Boolean,
    /** How what the branch left unchanged is drawn, while Changes is on. */
    unchanged: UnchangedSchema,
    /** Whether a Package's files outside its Source roots are drawn, dimmed. */
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
    /** The Package the Props name, once it is another. */
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
    /** Where the user moved to in the project. */
    Moved: WhereSchema.fields,
    DeletedToggled: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    IgnoredToggled: {},
    SwitchAsked: {},
  },
});
