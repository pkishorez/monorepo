import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  FolderListingSchema,
  FolderSchema,
  type Folder,
} from '../../../../../server/rpc/folders/contract/index.js';
import {
  ProjectEntrySchema,
  type ProjectEntry,
} from '../../../../../server/rpc/project-registry/contract/index.js';
import { MonoverseClient } from '../../../../../services/monoverse-client/contract/index.js';

/*
 * The Project Picker: which Project Monoverse shows, as the code app's
 * Project Picker chooses one, a stack of Steps with a search each.
 *
 * 1. Recent  the saved Projects, newest first, read once it starts. A
 *            Project picked Emits `Picked` at once. One can be removed from
 *            the list, gone from it at once and put back if the server
 *            refuses. "Open a folder…", after them whatever the search,
 *            goes to the folder Steps, searching what was typed.
 * 2. Folder  home's sub-folders, read ahead as it starts, then one Step per
 *            folder gone into, never above home (`selectors.ts`). The top
 *            Step's listing is asked again for a search it does not cover: a
 *            hidden one (starting with `.`), or one cut short at 100, a
 *            moment after the typing stops. A typed path goes there.
 * 3. Choose  a folder chosen, the one highlighted or the one open, is
 *            added as a Project while the Picker waits, then Emits
 *            `Picked`; a refusal is said, and it can be chosen again.
 * 4. Close   `Dismissed` asks whoever holds it to close it.
 */

/*
 * What the Project Picker holds: the saved Projects, and its Steps, the
 * Recent one at the bottom and one folder Step per folder gone into above
 * it. Only the top Step is drawn; each keeps its own search and highlighted
 * row, so going back finds it as it was left.
 */

/** What a folder Step or its rows would open as. */
export const KindSchema = Schema.NullOr(
  Schema.Literals(['monorepo', 'package']),
);
export type Kind = typeof KindSchema.Type;

/** A folder's sub-folders, as the server listed them for one search. */
export const ListingSchema = Schema.Struct({
  /** The search it answers, trimmed, and whether hidden folders were asked for. */
  query: Schema.String,
  hidden: Schema.Boolean,
  /** The folder listed, absolute; '' when it could not be read. */
  path: Schema.String,
  kind: KindSchema,
  folders: Schema.Array(FolderSchema),
  /** More matched than were listed: a longer search is asked again. */
  truncated: Schema.Boolean,
  /** Why the folder could not be read. */
  problem: Schema.NullOr(Schema.String),
});
export type Listing = typeof ListingSchema.Type;

export const FolderStepSchema = Schema.Struct({
  /** The folders gone into below home, one name each; none at home. */
  segments: Schema.Array(Schema.String),
  query: Schema.String,
  /** The row highlighted, by value; '' for none yet. */
  highlighted: Schema.String,
  /** Null until the server first answers. */
  listing: Schema.NullOr(ListingSchema),
});
export type FolderStep = typeof FolderStepSchema.Type;

export const ModelSchema = Schema.Struct({
  /** The Project open now, as the Input said; Props say it after. */
  current: Schema.NullOr(Schema.String),
  /** The home folder, absolute, once the server has said. */
  home: Schema.NullOr(Schema.String),
  /** Home's listing read ahead, so "Open a folder…" opens at once. */
  homeListing: Schema.NullOr(ListingSchema),
  /** The saved Projects, newest first; null until read. */
  recent: Schema.NullOr(Schema.Array(ProjectEntrySchema)),
  /** Why they could not be read. */
  recentProblem: Schema.NullOr(Schema.String),
  /** The Recent Step's search and highlighted row. */
  query: Schema.String,
  highlighted: Schema.String,
  /** The folder Steps, home first; none while on Recent. */
  folders: Schema.Array(FolderStepSchema),
  /** Projects on their way out, hidden already. */
  removing: Schema.Array(Schema.String),
  /** The folder being added as a Project, while the server adds it. */
  adding: Schema.NullOr(Schema.String),
  /** Why the last add or remove failed. */
  problem: Schema.NullOr(Schema.String),
});
export type Model = typeof ModelSchema.Type;

/** The value of the pinned row that goes to the folder Steps. */
export const OPEN_FOLDER = 'open-folder';

export const ProjectPickerShape = Actor.define('ProjectPicker', {
  requires: [MonoverseClient],
  input: Schema.Struct({ current: Schema.NullOr(Schema.String) }),
  props: Schema.UndefinedOr(
    Schema.Struct({
      /** The Project open now, marked in the list. */
      current: Schema.NullOr(Schema.String),
    }),
  ),
  model: ModelSchema,
  message: Schema.TaggedUnion({
    Typed: { query: Schema.String },
    /** The highlight moves `by` rows, down for 1 and up for -1. */
    Moved: { by: Schema.Finite },
    Highlighted: { value: Schema.String },
    /** Enter or a click on a row: a Project opens, a folder is gone into. */
    Picked: { value: Schema.String },
    /** Mod+Enter on a row, or "Open this folder" with null: chosen as a Project. */
    Chose: { on: Schema.NullOr(Schema.String) },
    /** Back one Step. */
    WentBack: {},
    /** Back to `depth` folder Steps, 0 being Recent. */
    WentBackTo: { depth: Schema.Finite },
    Dismissed: {},
    RemoveAsked: { id: Schema.String },
    Removed: { id: Schema.String },
    RemoveRefused: { id: Schema.String, problem: Schema.String },
    Added: { project: ProjectEntrySchema },
    AddRefused: { problem: Schema.String },
    RecentRead: { projects: Schema.Array(ProjectEntrySchema) },
    RecentRefused: { problem: Schema.String },
    Retried: {},
    HomeFound: { listing: FolderListingSchema },
    Loaded: {
      segments: Schema.Array(Schema.String),
      listing: ListingSchema,
      home: Schema.NullOr(Schema.String),
    },
  }),
  emits: {
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
  },
});

// What the top Step shows: its rows, grouped, best match first.

/** A row as a search found it: the label's matching character offsets, for drawing them lit. */
export interface Ranked<T> {
  readonly entry: T;
  readonly matched: ReadonlyArray<number>;
}

export type Row =
  | {
      readonly _tag: 'Project';
      readonly value: string;
      readonly label: string;
      readonly detail: string;
      readonly project: ProjectEntry;
      readonly current: boolean;
    }
  | {
      readonly _tag: 'OpenFolder';
      readonly value: string;
      readonly label: string;
      readonly detail: string;
    }
  | {
      readonly _tag: 'Folder';
      readonly value: string;
      readonly label: string;
      readonly folder: Folder;
    };

export interface Group {
  readonly heading: string | null;
  readonly rows: ReadonlyArray<Ranked<Row>>;
}

export interface Shown {
  readonly step: 'recent' | 'folder';
  readonly groups: ReadonlyArray<Group>;
  /** Every row, as drawn. */
  readonly rows: ReadonlyArray<Row>;
  readonly loading: boolean;
  /** Why the rows could not be read. */
  readonly problem: string | null;
  /** Said where there are no rows, and a hint under it. */
  readonly empty: string | null;
  readonly hint: string | null;
  readonly placeholder: string;
  /** More folders matched than were listed. */
  readonly truncated: boolean;
  /** The folder open, on a folder Step. */
  readonly where: {
    readonly crumbs: ReadonlyArray<string>;
    /** Absolute; null until home is known, or when it cannot be read. */
    readonly path: string | null;
    readonly kind: Kind;
  } | null;
}
