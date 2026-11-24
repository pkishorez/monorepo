import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ProjectEntrySchema } from '../../../server/rpc/project-registry/contract/index.js';
import { Projects } from '../../../services/projects/contract/index.js';

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
 *             from an open project, its crumb opens it over the page.
 *             Picking one opens it, at its current branch.
 * 3. Show     the project open, as a Project of its own: where in it the
 *             Place says, the Package, the branch, Compare to and
 *             Changes, is handed to it, and every move the user makes in it
 *             comes back as the Place it moved to. How its trees are drawn,
 *             the files the branch deleted, what it left unchanged and a
 *             Package's ignored files, is handed to it too, and kept as
 *             another project opens.
 * 4. Follow   the Place the Props name, whenever it is another than the
 *             one shown, as Back and Forward do: the same Monoverse moves
 *             there, and says nothing, since whoever named it knows. Its
 *             own move, handed back, names the Place it shows already:
 *             nothing happens.
 */

/*
 * What every file tree in Monoverse shares, the tree and a folder looked
 * into alike: how what the branch left unchanged is drawn.
 */

/** How what the branch left unchanged is drawn while Changes is on: as it is, faded, or not at all. */
export const UnchangedSchema = Schema.Literals(['show', 'dim', 'hide']);
export type Unchanged = typeof UnchangedSchema.Type;

/** Where in the project shown: the Package, and how it is read. */
const Where = {
  /** The Package of a Monorepo entered, by its folder; null: the Monorepo's tree. */
  package: Schema.NullOr(Schema.String),
  /** The branch shown; null: the one the project's folder is on. */
  branch: Schema.NullOr(Schema.String),
  /** The branch compared to; null: `main`, else `master`, else `develop`. */
  base: Schema.NullOr(Schema.String),
  /** Whether what the branch changed since Compare-to is coloured. */
  changes: Schema.Boolean,
};

/** Where Monoverse is: the project, the Package in it, and how it is read. */
export const PlaceSchema = Schema.Struct({
  /** The saved project shown, by its id; null: the picker. */
  project: Schema.NullOr(Schema.String),
  ...Where,
});
export type Place = typeof PlaceSchema.Type;

const State = Schema.TaggedUnion({
  Picking: {},
  /** A project named before the saved ones are listed. */
  Finding: { project: Schema.String },
  Showing: {
    /** The saved project open, by its id. */
    project: Schema.String,
    /** Its folder, absolute. */
    root: Schema.String,
  },
});
export type State = typeof State.Type;

const Model = Schema.Struct({
  /** The saved projects, newest first; null until they are listed. */
  projects: Schema.NullOr(Schema.Array(ProjectEntrySchema)),
  /** Why they could not be listed. */
  projectsProblem: Schema.NullOr(Schema.String),
  ...Where,
  /** Whether the files the branch deleted are drawn, and listed. */
  deleted: Schema.Boolean,
  /** How what the branch left unchanged is drawn, while Changes is on. */
  unchanged: UnchangedSchema,
  /** Whether a Package's files outside its Source roots are drawn, dimmed. */
  ignored: Schema.Boolean,
  /** The picker is open over an open project. */
  switching: Schema.Boolean,
});
export type Model = typeof Model.Type;

export const MonoverseShape = Actor.define('Monoverse', {
  requires: [Projects],
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
    /** Where the user moved to in the project shown. */
    Moved: Where,
    DeletedToggled: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    IgnoredToggled: {},
  }),
  emits: { Moved: PlaceSchema.fields },
});
