import { Schema } from 'effect';

export const ModuleSourceFileSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
});

export type ModuleSourceFile = typeof ModuleSourceFileSchema.Type;

export const ModuleSourceSnapshotSchema = Schema.Struct({
  modulePath: Schema.String,
  entryPoint: Schema.optional(Schema.String),
  files: Schema.Array(ModuleSourceFileSchema),
});

export type ModuleSourceSnapshot = typeof ModuleSourceSnapshotSchema.Type;
