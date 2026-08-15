import { Schema } from 'effect';

export const ModuleDefinitionSchema = Schema.Struct({
  kind: Schema.Literals(['normal', 'shared', 'entry']),
  subpaths: Schema.Array(Schema.String),
});

export type ModuleDefinition = typeof ModuleDefinitionSchema.Type;

const ModuleImportViolationSchema = Schema.Struct({
  fromFile: Schema.String,
  fromModule: Schema.String,
  toFile: Schema.String,
  toModule: Schema.String,
});

export type ModuleImportViolation = typeof ModuleImportViolationSchema.Type;

export const ModuleDependencySchema = Schema.Struct({
  fromModule: Schema.String,
  toModule: Schema.String,
  // Absent when the import bypasses every public entry point of the target Module.
  toEntryPoint: Schema.optional(Schema.String),
});

export type ModuleDependency = typeof ModuleDependencySchema.Type;

export const ModuleKindSchema = Schema.Literals(['normal', 'shared', 'entry']);

export type ModuleKind = typeof ModuleKindSchema.Type;

export const ModuleShapeSchema = Schema.Literals(['file', 'directory']);

export type ModuleShape = typeof ModuleShapeSchema.Type;

export const ObservedModuleKindSchema = Schema.Literals([
  'regular',
  'root',
  'terminal',
  'isolated',
]);

export type ObservedModuleKind = typeof ObservedModuleKindSchema.Type;

export const AnalyzedModuleSchema = Schema.Struct({
  path: Schema.String,
  layer: Schema.String,
  kind: ModuleKindSchema,
  shape: ModuleShapeSchema,
  observedKind: ObservedModuleKindSchema,
  subpaths: Schema.Array(Schema.String),
});

export type AnalyzedModule = typeof AnalyzedModuleSchema.Type;

export const ModuleViolationSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('coverage'), file: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('missing-entry-point'),
    module: Schema.String,
    path: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('dependency'),
    ...ModuleImportViolationSchema.fields,
  }),
  Schema.Struct({
    kind: Schema.Literal('boundary'),
    ...ModuleImportViolationSchema.fields,
  }),
  Schema.Struct({
    kind: Schema.Literal('cycle'),
    modules: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal('unused-shared'),
    module: Schema.String,
  }),
]);

export type ModuleViolation = typeof ModuleViolationSchema.Type;

export const ModuleAnalysisSchema = Schema.Struct({
  modules: Schema.Array(AnalyzedModuleSchema),
  membership: Schema.ReadonlyMap(Schema.String, Schema.String),
  entryPoints: Schema.ReadonlySet(Schema.String),
  dependencies: Schema.Array(ModuleDependencySchema),
  violations: Schema.Array(ModuleViolationSchema),
});

export type ModuleAnalysis = typeof ModuleAnalysisSchema.Type;
