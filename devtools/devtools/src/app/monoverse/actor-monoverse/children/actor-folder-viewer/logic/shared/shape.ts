import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangedPathSchema,
  type ChangeStatus,
} from '../../../../../server/rpc/git/contract/index.js';
import { UnchangedSchema } from '../../../../logic/shared/index.js';

/*
 * One folder looked into, the root included: its files as a tree of their
 * folders, drawn as the tree draws its own, by the same settings. While
 * Changes is on, each changed file is marked with how, and what the branch
 * left unchanged is listed as it is, dimmed or not at all; the files it
 * deleted are listed unless they are left out. A Package's files outside
 * its Source roots are dimmed, or left out. One file is shown beside the
 * list, as the branch has it or as its diff.
 *
 * 1. List    the files, each folder of which closes and opens again;
 *            every folder at once, down to the top level or all the way
 *            open; or everything inside one folder, all open or every
 *            folder in it closed, it staying open. The settings come from
 *            whoever holds it, and a change to one Emits it, so the
 *            tree changes with it.
 * 2. Show    the one chosen, else the first changed (or, with Changes off,
 *            the first file), in a FileViewer; one the settings leave out
 *            gives way to that first one. On a phone the list and the file
 *            take turns: choosing one shows it, and its back arrow goes
 *            back to the list. Stepping goes to the changed file before or
 *            after it in the list's order (any file, with Changes off),
 *            opening the closed folders on the way.
 * 3. Close   Emits `Closed`.
 */

const FolderInput = Schema.Struct({
  /** The project's folder, absolute. */
  root: Schema.String,
  /** The branch read; null: the folder as it is on disk. */
  branch: Schema.NullOr(Schema.String),
  /** Compare-to while Changes is on; null while it is off. */
  base: Schema.NullOr(Schema.String),
  /** The folder, relative to the root; `''` for the root. */
  path: Schema.String,
  /** What to call it: its path, or the project's name for the root. */
  title: Schema.String,
  /** Every file in it known, relative to the root. */
  files: Schema.Array(Schema.String),
  /** What the branch changed in it since Compare-to. */
  changed: Schema.Array(ChangedPathSchema),
  /** The Package's Source roots; null: nothing in it is ignored. */
  sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
});

/** How the list draws its files: the tree's settings. */
export const FolderSettingsSchema = Schema.Struct({
  unchanged: UnchangedSchema,
  deleted: Schema.Boolean,
  ignored: Schema.Boolean,
});
export type FolderSettings = typeof FolderSettingsSchema.Type;

/** The settings a FolderViewer starts with, mounted with none. */
export const defaultSettings: FolderSettings = {
  unchanged: 'dim',
  deleted: true,
  ignored: true,
};

export const FolderViewerShape = Actor.define('FolderViewer', {
  input: FolderInput,
  /** The settings; none: the defaults. */
  props: Schema.UndefinedOr(FolderSettingsSchema),
  model: Schema.Struct({
    ...FolderInput.fields,
    /** The file chosen; null: none yet, the first shown. */
    selected: Schema.NullOr(Schema.String),
    /** On a phone: the file shown, not the list. */
    showing: Schema.Boolean,
    /** The folders closed in the list. */
    closed: Schema.Array(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Selected: { path: Schema.String },
    /** To the file before (-1) or after (1) the one shown. */
    Stepped: { by: Schema.Number },
    FolderToggled: { path: Schema.String },
    /** Every folder closed, the top level left; or, if any is, every one open. */
    AllToggled: {},
    /** Everything inside a folder open; or, if it all is, every folder in it closed. */
    InsideToggled: { path: Schema.String },
    UnchangedChosen: { unchanged: UnchangedSchema },
    DeletedToggled: {},
    IgnoredToggled: {},
    /** On a phone: from the file back to the list. */
    WentBack: {},
    Closed: {},
  }),
  emits: {
    Closed: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    DeletedToggled: {},
    IgnoredToggled: {},
  },
});

export interface FolderEntry {
  readonly path: string;
  /** How the branch changed it; null: unchanged, or Changes is off. */
  readonly status: ChangeStatus | null;
  /** Outside the Package's Source roots. */
  readonly ignored: boolean;
}

/** One row of the list: a folder, or a file. */
export type FileTreeRow =
  | {
      readonly kind: 'folder';
      /** Its path, relative to the root. */
      readonly path: string;
      /** Its name, or the names of the folders sharing its row. */
      readonly label: string;
      readonly depth: number;
      readonly open: boolean;
      readonly status: ChangeStatus | null;
    }
  | {
      readonly kind: 'file';
      readonly path: string;
      readonly name: string;
      readonly depth: number;
      readonly status: ChangeStatus | null;
    };
