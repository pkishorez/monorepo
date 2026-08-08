import { Schema } from 'effect';

export const LayerDefinitionSchema = Schema.Struct({
  paths: Schema.Array(Schema.String),
  description: Schema.optional(Schema.String),
});

export type LayerDefinition = typeof LayerDefinitionSchema.Type;

export const ForbiddenImportSchema = Schema.Struct({
  fromFile: Schema.String,
  fromLayer: Schema.String,
  toFile: Schema.String,
  toLayer: Schema.String,
});

export type ForbiddenImport = typeof ForbiddenImportSchema.Type;

export const LayerAnalysisSchema = Schema.Struct({
  membership: Schema.ReadonlyMap(Schema.String, Schema.String),
  allowedDependencies: Schema.ReadonlyMap(
    Schema.String,
    Schema.ReadonlySet(Schema.String),
  ),
  unassignedFiles: Schema.Array(Schema.String),
  forbiddenImports: Schema.Array(ForbiddenImportSchema),
  layersWithoutModules: Schema.Array(Schema.String),
});

export type LayerAnalysis = typeof LayerAnalysisSchema.Type;
