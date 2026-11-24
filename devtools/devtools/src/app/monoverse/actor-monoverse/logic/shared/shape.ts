import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  BranchesSchema,
  ChangedPathSchema,
} from '../../../server/rpc/git/contract/index.js';
import { ProjectEntrySchema } from '../../../server/rpc/project-registry/contract/index.js';
import {
  ImportSchema,
  WorkspaceSchema,
} from '../../../server/rpc/project/contract/index.js';
import { Monorepo } from '../../../services/monorepo/contract/index.js';

/*
 * Monoverse: a codebase shown as its folder tree, and checked. It knows
 * nothing of URLs: whoever mounts it hands it a Place, may hand it another
 * from then on, and hears of every move the user makes, as the Place it
 * moved to. Mounted on its own, as the root, it is handed none and follows
 * only the user.
 *
 * 1. List     the saved projects, from the server, to find the folder of
 *             the project a Place names.
 * 2. Pick     with no project, or one not saved, the picker fills the page;
 *             from an open project, the breadcrumb opens it over the page.
 *             Picking one opens it, at its current branch.
 * 3. Follow   the Place the Props name, whenever it is another than the
 *             one shown, as Back and Forward do: the same Monoverse moves
 *             there, and says nothing, since whoever named it knows. Its
 *             own move, handed back, names the Place it shows already:
 *             nothing happens.
 * 4. Analyse  the project at the branch: a Monorepo opens its tree, a
 *             Single Package straight its Package. Choosing another branch
 *             analyses it again, the views staying on screen meanwhile.
 * 5. Git      the branches as the project opens: which one its folder is
 *             on, and what Compare to starts at. A branch or Compare to
 *             the Place does not name is that one. While Changes is on,
 *             what the branch changed since Compare-to is read, and handed
 *             down to colour the tree; the files it deleted are drawn
 *             unless they are left out, here or in a folder looked into;
 *             what it left unchanged is drawn as it is, faded (the
 *             default) or not at all. A Package's files outside its
 *             Source roots are drawn dimmed, unless they are left out.
 * 6. Enter    a Package of the Monorepo, by a double click on it or from
 *             the Package menu, which goes back to the Monorepo's tree too.
 * 7. View     a file opens in a dialog over the tree, as the branch has
 *             it, or as its diff while Changes is on and the branch changed
 *             it; a folder, the root included, opens there as the list of
 *             its files, what changed in it marked while Changes is on,
 *             drawn by the tree's settings, which it changes too. One of
 *             the two at a time. A Package viewed from the
 *             Monorepo's tree is viewed for its changes: Changes turns on
 *             if it is off, and the folder opens once they are read.
 */

/*
 * What every file tree in Monoverse shares, the tree and a folder looked
 * into alike: how what the branch left unchanged is drawn.
 */

/** How what the branch left unchanged is drawn while Changes is on: as it is, faded, or not at all. */
export const UnchangedSchema = Schema.Literals(['show', 'dim', 'hide']);
export type Unchanged = typeof UnchangedSchema.Type;

/** Where Monoverse is: the project, the Package in it, and how it is read. */
export const PlaceSchema = Schema.Struct({
  /** The saved project shown, by its id; null: the picker. */
  project: Schema.NullOr(Schema.String),
  /** The Package of a Monorepo entered, by its folder; null: the Monorepo's tree. */
  package: Schema.NullOr(Schema.String),
  /** The branch shown; null: the one the project's folder is on. */
  branch: Schema.NullOr(Schema.String),
  /** The branch compared to; null: `main`, else `master`, else `develop`. */
  base: Schema.NullOr(Schema.String),
  /** Whether what the branch changed since Compare-to is coloured. */
  changes: Schema.Boolean,
});
export type Place = typeof PlaceSchema.Type;

const Open = {
  /** The saved project open, by its id. */
  project: Schema.String,
  /** Its folder, absolute. */
  root: Schema.String,
};

/** What an analysis was read at: the branch, and how many reloads. */
const Analysed = {
  at: Schema.String,
  workspace: WorkspaceSchema,
};

const State = Schema.TaggedUnion({
  Picking: {},
  /** A project named before the saved ones are listed. */
  Finding: { project: Schema.String },
  Opening: Open,
  Failure: {
    ...Open,
    at: Schema.String,
    problem: Schema.String,
    missing: Schema.Boolean,
  },
  Monorepo: {
    ...Open,
    ...Analysed,
    links: Schema.Array(ImportSchema),
    cycles: Schema.Array(ImportSchema),
  },
  /** A Single Package. */
  Package: { ...Open, ...Analysed },
});
export type State = typeof State.Type;

const Model = Schema.Struct({
  /** The saved projects, newest first; null until they are listed. */
  projects: Schema.NullOr(Schema.Array(ProjectEntrySchema)),
  /** Why they could not be listed. */
  projectsProblem: Schema.NullOr(Schema.String),
  package: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
  changes: Schema.Boolean,
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
  /** Whether the files the branch deleted are drawn, and listed. */
  deleted: Schema.Boolean,
  /** How what the branch left unchanged is drawn, while Changes is on. */
  unchanged: UnchangedSchema,
  /** Whether a Package's files outside its Source roots are drawn, dimmed. */
  ignored: Schema.Boolean,
  /** The file open over the tree, relative to the root. */
  file: Schema.NullOr(Schema.String),
  /** The folder open over the tree, and every file in it. */
  folder: Schema.NullOr(
    Schema.Struct({
      path: Schema.String,
      files: Schema.Array(Schema.String),
      /** The Source roots of the Package it is in; null: none ignored. */
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    }),
  ),
  /** The picker is open over an open project. */
  switching: Schema.Boolean,
  /** How many times the project was asked to be read again. */
  reloads: Schema.Number,
});
export type Model = typeof Model.Type;

export const MonoverseShape = Actor.define('Monoverse', {
  requires: [Monorepo],
  /** Where to start. */
  input: PlaceSchema,
  /**
   * Where to be, from whoever mounts it; nothing at all for a Monoverse
   * mounted on its own.
   */
  props: Schema.UndefinedOr(PlaceSchema),
  model: Model,
  state: State,
  message: Schema.TaggedUnion({
    Listed: { projects: Schema.Array(ProjectEntrySchema) },
    ListRefused: { problem: Schema.String },
    Followed: { place: PlaceSchema },
    SwitchAsked: {},
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
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
    FileOpened: { path: Schema.String },
    FileClosed: {},
    FolderViewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
    FolderClosed: {},
  }),
  emits: { Moved: PlaceSchema.fields },
});
