import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import {
  At,
  GitUnavailableError,
  InvalidRootError,
} from '../../project/contract/index.js';

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

const ReadFileError = Schema.Union([
  InvalidRootError,
  FileNotFoundError,
  FileOutsideError,
  FileReadError,
  GitUnavailableError,
]);

/** Reading one file of a Project at a branch, by its root-relative path. */
export const FilesRpc = RpcGroup.make(
  Rpc.make('ReadFile', {
    payload: { ...At, path: Schema.String },
    success: FileContentSchema,
    error: ReadFileError,
  }),
);
