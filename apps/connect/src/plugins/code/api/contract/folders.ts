import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import {
  FolderExists,
  FolderNotFound,
  FolderUnreadable,
  InvalidFolderName,
  OutsideHome,
  PermissionDenied,
} from './errors.js';

/*
 * The home folder and the folders below it, to choose or make a Project's
 * folder from. A path is `~`, `~/…`, absolute, or relative to home; one
 * that resolves outside home is refused.
 */

/** One sub-folder in a listing. */
export const FolderEntry = ESchema.make('FolderEntry', {
  name: Schema.String,
  /** Its name starts with `.`. */
  hidden: Schema.Boolean,
  /** A symlink to a folder inside home, not a folder itself. */
  link: Schema.Boolean,
}).build();
export type FolderEntry = typeof FolderEntry.Type;

export const FolderListing = ESchema.make('FolderListing', {
  /** The folder listed, its symlinks resolved. */
  path: Schema.String,
  /** The folder above it; null for home. */
  parent: Schema.NullOr(Schema.String),
  /** Name-sorted, at most 100. */
  folders: Schema.Array(FolderEntry.schema),
  /** More folders matched than `folders` holds: ask again with a query. */
  truncated: Schema.Boolean,
}).build();
export type FolderListing = typeof FolderListing.Type;

export const CreatedFolder = ESchema.make('CreatedFolder', {
  path: Schema.String,
  /** Why `git init` failed; null when it ran. The folder is kept either way. */
  gitInitError: Schema.NullOr(Schema.String),
}).build();
export type CreatedFolder = typeof CreatedFolder.Type;

export const FoldersRpc = RpcGroup.make(
  /**
   * The sub-folders of `path`. Hidden ones show only for a query starting
   * with `.`; a query keeps the names holding it, any case.
   */
  Rpc.make('listFolder', {
    payload: ValueESchema.make(
      'ListFolderPayload',
      Schema.Struct({
        path: Schema.String,
        query: Schema.optionalKey(Schema.String),
      }),
    ).build().schema,
    success: FolderListing.schema,
    error: Schema.Union([
      FolderNotFound,
      PermissionDenied,
      OutsideHome,
      FolderUnreadable,
    ]),
  }),
  /**
   * Makes the folder `name` in the folder `parent`, never its parents, and
   * runs `git init` in it. It is not added as a Project.
   */
  Rpc.make('createFolder', {
    payload: ESchema.make('CreateFolderPayload', {
      parent: Schema.String,
      name: Schema.String,
    }).build().schema,
    success: CreatedFolder.schema,
    error: Schema.Union([
      FolderNotFound,
      PermissionDenied,
      OutsideHome,
      FolderExists,
      InvalidFolderName,
    ]),
  }),
);
