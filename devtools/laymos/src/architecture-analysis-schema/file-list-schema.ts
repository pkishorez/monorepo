import { Schema } from 'effect';

/**
 * One git-tracked file beneath a Module's folder. `analyzed` is false for an
 * Unanalyzed file: unsupported, or beneath an Ignored path.
 */
export const FileListEntrySchema = Schema.Struct({
  path: Schema.String,
  analyzed: Schema.Boolean,
});

export type FileListEntry = typeof FileListEntrySchema.Type;

export const FileListSchema = Schema.Struct({
  modulePath: Schema.String,
  // The Module's Index, when it has one.
  index: Schema.optional(Schema.String),
  files: Schema.Array(FileListEntrySchema),
});

export type FileList = typeof FileListSchema.Type;

export const FileContentSchema = Schema.Struct({
  path: Schema.String,
  // Empty for a binary file, whose bytes are never sent.
  content: Schema.String,
  binary: Schema.optional(Schema.Boolean),
});

export type FileContent = typeof FileContentSchema.Type;

/**
 * Every file git knows beneath a folder, read in full. Monoverse reads a
 * Package's files this way.
 */
export const FolderFileSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  binary: Schema.optional(Schema.Boolean),
});

export type FolderFile = typeof FolderFileSchema.Type;
