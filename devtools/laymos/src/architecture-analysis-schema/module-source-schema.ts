import { Schema } from 'effect';

export const ModuleSourceFileSchema = Schema.Struct({
  path: Schema.String,
  // Empty for a binary file, whose bytes are never sent.
  content: Schema.String,
  binary: Schema.optional(Schema.Boolean),
  // An Unanalyzed file: known to git but outside the analysis universe.
  unanalyzed: Schema.optional(Schema.Boolean),
});

export type ModuleSourceFile = typeof ModuleSourceFileSchema.Type;

export const ModuleSourceSnapshotSchema = Schema.Struct({
  modulePath: Schema.String,
  entryPoint: Schema.optional(Schema.String),
  files: Schema.Array(ModuleSourceFileSchema),
});

export type ModuleSourceSnapshot = typeof ModuleSourceSnapshotSchema.Type;
