import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema, ImportSchema } from '../contract/index.js';
import { isWithin } from '../model/index.js';

/*
 * One folder tree on the canvas, the same for the repo view and a
 * Package's view: its parent hands it what to draw, and it keeps which
 * folders are open and what is selected.
 *
 * 1. Open    a folder's chevron opens or closes it. Closing a folder that
 *            holds the selection selects the folder instead, so what is
 *            selected is always on screen.
 * 2. Select  a click selects a node, and a click on it again, or on
 *            nothing, lets it go. What it connects to is drawn, and the
 *            Violations always are.
 * 3. Reveal  a closed folder that lights up opens down to what it holds
 *            that is connected.
 * 4. Act     a double click opens a folder, and Emits `Opened` for a file
 *            and `Entered` for a Package. Viewing a folder, the root
 *            included, Emits `Viewed` with every file in it.
 */

/** How what the branch left unchanged is drawn while Changes is on: as it is, faded, or not at all. */
export const UnchangedSchema = Schema.Literals(['show', 'dim', 'hide']);
export type Unchanged = typeof UnchangedSchema.Type;

export const TreePackageSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
  version: Schema.optional(Schema.String),
});

export const TreePropsSchema = Schema.Struct({
  /** The folder the tree is rooted at, relative to the root; `''` for the root. */
  base: Schema.String,
  /** What that folder stands for, by name: the project, or the Package. */
  name: Schema.String,
  /** The files to draw, inside `base`. */
  files: Schema.Array(Schema.String),
  /** The Packages to draw, each one leaf standing for its folder. */
  packages: Schema.Array(TreePackageSchema),
  /** What uses what, between files or between Packages. */
  links: Schema.Array(ImportSchema),
  /** The links that are findings: Violations, or the links of a Package cycle. */
  broken: Schema.Array(ImportSchema),
  /** The Source roots; anything outside them is ignored, drawn dimmed. Null: none ignored. */
  sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
  /** What the branch changed since Compare-to; null while Changes is off. */
  changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
  /** How what it left unchanged is drawn, while Changes is on. */
  unchanged: UnchangedSchema,
});

export type TreeProps = typeof TreePropsSchema.Type;

export const Tree = Actor.define('Tree', {
  input: Schema.Struct({
    /** The folders open at first. */
    open: Schema.Array(Schema.String),
  }),
  props: TreePropsSchema,
  model: Schema.Struct({
    open: Schema.Array(Schema.String),
    selected: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Toggled: { path: Schema.String },
    Selected: { path: Schema.NullOr(Schema.String) },
    Revealed: { folders: Schema.Array(Schema.String) },
    Opened: { path: Schema.String },
    Entered: { path: Schema.String },
    Viewed: { path: Schema.String, files: Schema.Array(Schema.String) },
  }),
  emits: {
    Opened: { path: Schema.String },
    Entered: { path: Schema.String },
    /** A folder to look into: every file in it, deleted ones included. */
    Viewed: { path: Schema.String, files: Schema.Array(Schema.String) },
  },
});

export const TreeLive = Tree.build({
  init: ({ open }) => ({ model: { open: [...open], selected: null } }),
  on: {
    // 1. Open
    Toggled: ({ path }, { model }) => {
      if (!model.open.includes(path))
        return { model: { open: [...model.open, path] } };
      const holdsSelection =
        model.selected !== null &&
        model.selected !== path &&
        isWithin(model.selected, path);
      return {
        model: {
          open: model.open.filter((folder) => folder !== path),
          ...(holdsSelection ? { selected: path } : {}),
        },
      };
    },
    // 2. Select
    Selected: ({ path }, { model }) => ({
      model: { selected: path === model.selected ? null : path },
    }),
    // 3. Reveal
    Revealed: ({ folders }, { model }) => {
      const adding = folders.filter((folder) => !model.open.includes(folder));
      return adding.length === 0
        ? {}
        : { model: { open: [...model.open, ...adding] } };
    },
    // 4. Act
    Opened: ({ path }) => ({ emit: { _tag: 'Opened', path } }),
    Entered: ({ path }) => ({ emit: { _tag: 'Entered', path } }),
    Viewed: ({ path, files }) => ({ emit: { _tag: 'Viewed', path, files } }),
  },
});
