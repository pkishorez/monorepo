import { Schema } from 'effect';

/** One sub-folder, as the Project picker lists it. */
export const FolderSchema = Schema.Struct({
  name: Schema.String,
  /** Absolute. */
  path: Schema.String,
  /** A symbolic link to a folder. */
  link: Schema.Boolean,
  /**
   * What it would open as: a Monorepo (workspace packages listed), a Single
   * Package (a `package.json` alone), or neither.
   */
  kind: Schema.NullOr(Schema.Literals(['monorepo', 'package'])),
});
export type Folder = typeof FolderSchema.Type;

/** A folder's sub-folders, at most 100, those holding the query first. */
export const FolderListingSchema = Schema.Struct({
  /** The folder listed, absolute. */
  path: Schema.String,
  /** The home folder, absolute: the picker never goes above it. */
  home: Schema.String,
  /** The folder listed, as above, but null at home. */
  parent: Schema.NullOr(Schema.String),
  /** What the listed folder itself would open as. */
  kind: Schema.NullOr(Schema.Literals(['monorepo', 'package'])),
  folders: Schema.Array(FolderSchema),
  /** More matched than were listed. */
  truncated: Schema.Boolean,
});
export type FolderListing = typeof FolderListingSchema.Type;

export class FolderError extends Schema.TaggedError<FolderError>('FolderError')(
  'FolderError',
  {
    reason: Schema.Literals([
      'not-found',
      'outside-home',
      'not-directory',
      'read',
    ]),
    path: Schema.String,
    message: Schema.String,
  },
) {}
