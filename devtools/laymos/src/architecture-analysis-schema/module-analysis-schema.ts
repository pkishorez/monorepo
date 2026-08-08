import { Schema } from 'effect';

export const ModuleDefinitionSchema = Schema.Struct({
  shared: Schema.Boolean,
  nested: Schema.Array(Schema.String),
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

export const ModuleKindSchema = Schema.Literals([
  'regular',
  'root',
  'terminal',
  'isolated',
]);

export type ModuleKind = typeof ModuleKindSchema.Type;

export const AnalyzedModuleSchema = Schema.Struct({
  path: Schema.String,
  layer: Schema.String,
  shared: Schema.Boolean,
  nested: Schema.Array(Schema.String),
  kind: ModuleKindSchema,
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
]);

export type ModuleViolation = typeof ModuleViolationSchema.Type;

export const ModuleAnalysisSchema = Schema.Struct({
  modules: Schema.Array(AnalyzedModuleSchema),
  membership: Schema.ReadonlyMap(Schema.String, Schema.String),
  unexposedModules: Schema.ReadonlySet(Schema.String),
  entryPoints: Schema.ReadonlySet(Schema.String),
  dependencies: Schema.Array(ModuleDependencySchema),
  violations: Schema.Array(ModuleViolationSchema),
});

export type ModuleAnalysis = typeof ModuleAnalysisSchema.Type;
