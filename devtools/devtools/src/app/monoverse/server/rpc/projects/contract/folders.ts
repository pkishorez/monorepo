import { Schema } from 'effect';

export const FolderSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  link: Schema.Boolean,
  kind: Schema.NullOr(Schema.Literals(['monorepo', 'package'])),
});
export type Folder = typeof FolderSchema.Type;

export const FolderListingSchema = Schema.Struct({
  path: Schema.String,
  home: Schema.String,
  parent: Schema.NullOr(Schema.String),
  kind: Schema.NullOr(Schema.Literals(['monorepo', 'package'])),
  folders: Schema.Array(FolderSchema),
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
