import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema } from '../../../../../../../../server/rpc/git/contract/index.js';
import {
  CheckSchema,
  ImportSchema,
} from '../../../../../../../../server/rpc/project/contract/index.js';
import { UnchangedSchema } from '../../../../../../../logic/shared/index.js';

/*
 * One folder tree, the same for the repo view and a
 * Package's view: its parent hands it what to draw, and it keeps which
 * folders are open and what is selected.
 *
 * 1. Open    a folder's chevron opens or closes it; so do buttons for
 *            every folder at once, or for everything inside one; and one
 *            puts the tree back as it opened, nothing selected. Closing
 *            a folder that holds the selection selects the outermost
 *            folder closed over it instead, so what is selected is always
 *            on screen.
 * 2. Select  a click selects a node, and a click on it again, or on
 *            nothing, lets it go. What it connects to is drawn, each
 *            broken link with what is wrong with it. How many Violations
 *            each node holds is always drawn, and so is each Package's
 *            Check.
 * 3. Reveal  a closed folder that lights up opens down to what it holds
 *            that is connected.
 * 4. Act     a double click opens a folder, and Emits `Opened` for a file
 *            and `Entered` for a Package. Viewing a folder, the root
 *            included, Emits `Viewed` with every file in it and the
 *            Source roots.
 */

const TreePackageSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
  version: Schema.optional(Schema.String),
  /** What its monoverse.json makes of it. */
  check: CheckSchema,
});

export type TreePackage = typeof TreePackageSchema.Type;

/**
 * A finding, and what is wrong with it, in one sentence: a broken link
 * from one file to another, or, without `to`, something wrong in `from`
 * itself, such as a contract, or a monoverse.json's exception that lets
 * nothing through. A Violation says where in `from`, as `monoverse lint`
 * does.
 */
const BrokenLinkSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.optional(Schema.String),
  line: Schema.optional(Schema.Number),
  column: Schema.optional(Schema.Number),
  message: Schema.String,
});

export type BrokenLink = typeof BrokenLinkSchema.Type;

/** What the tree marks on each node. */
export interface Findings {
  /** How many Violations each node holds. */
  readonly violations: ReadonlyMap<string, number>;
  /** How many Packages in a cycle each node holds; only in the repo. */
  readonly cycles: ReadonlyMap<string, number>;
  /** Each Package's Check, by its folder; only in the repo. */
  readonly checks: ReadonlyMap<string, TreePackage['check']>;
}

/** One thing wrong with the selection: what is said of it, and where, from its Package. */
export interface Finding {
  readonly message: string;
  readonly where: string;
}

const TreePropsSchema = Schema.Struct({
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
  /**
   * The links that are findings: in a Package, its Violations, each
   * counted at the file `monoverse lint` tells it on, the monoverse.json
   * for its own; in the repo, the links of a Package cycle.
   */
  broken: Schema.Array(BrokenLinkSchema),
  /** The Source roots; anything outside them is ignored, drawn dimmed. Null: none ignored. */
  sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
  /** What the branch changed since Compare-to; null while Changes is off. */
  changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
  /** How what it left unchanged is drawn, while Changes is on. */
  unchanged: UnchangedSchema,
  /** Whether what is outside the Source roots is drawn, dimmed, or left out. */
  ignored: Schema.Boolean,
});

export type TreeProps = typeof TreePropsSchema.Type;

export const TreeShape = Actor.define('Tree', {
  input: Schema.Struct({
    /** The folders open at first. */
    open: Schema.Array(Schema.String),
  }),
  props: TreePropsSchema,
  model: Schema.Struct({
    open: Schema.Array(Schema.String),
    /** The folders open at first: the default view, to go back to. */
    home: Schema.Array(Schema.String),
    selected: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Toggled: { path: Schema.String },
    /** These folders open, and no others. */
    OpenChosen: { open: Schema.Array(Schema.String) },
    /** Back to the default view: the folders open at first, nothing selected. */
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
    /** A folder to look into: every file in it, deleted ones included. */
    Viewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
  },
});
