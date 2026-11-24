import { Schema } from 'effect';

export const FileContentSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  binary: Schema.optional(Schema.Boolean),
}).annotate({
  title: 'File Content',
  description:
    'One file of the root as text; a binary file comes back without its bytes.',
});

export type FileContent = typeof FileContentSchema.Type;

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>(
  'FileNotFoundError',
)('FileNotFoundError', { path: Schema.String }) {}

export class FileOutsideError extends Schema.TaggedError<FileOutsideError>(
  'FileOutsideError',
)('FileOutsideError', { path: Schema.String }) {}

export class FileReadError extends Schema.TaggedError<FileReadError>(
  'FileReadError',
)('FileReadError', { path: Schema.String, message: Schema.String }) {}
