import { Schema } from 'effect';

import { FolderSchema, ProjectEntrySchema } from '../../contract/index.js';

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
