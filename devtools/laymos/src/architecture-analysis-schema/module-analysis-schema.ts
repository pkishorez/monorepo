import { Schema } from 'effect';

export const ModuleDefinitionSchema = Schema.Struct({
  layer: Schema.String,
  shared: Schema.Boolean,
  exposed: Schema.Boolean,
  // Absent for a free-form Module; the owning Module Graph id for a member.
  graph: Schema.optional(Schema.String),
  // The member's key relative to its Module Graph path. Absent when free-form.
  member: Schema.optional(Schema.String),
});

export type ModuleDefinition = typeof ModuleDefinitionSchema.Type;

export const ModuleGraphDefinitionSchema = Schema.Struct({
  layer: Schema.String,
  path: Schema.String,
  members: Schema.Record(Schema.String, Schema.String),
  rules: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});

export type ModuleGraphDefinition = typeof ModuleGraphDefinitionSchema.Type;

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
  // Absent when the import bypasses the public entry point of the target Module.
  toEntryPoint: Schema.optional(Schema.String),
  // False when the import is a Module dependency violation, a Layer dependency
  // violation, or bypasses the target's public entry point.
  permitted: Schema.Boolean,
});

export type ModuleDependency = typeof ModuleDependencySchema.Type;

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
  shared: Schema.Boolean,
  exposed: Schema.Boolean,
  shape: ModuleShapeSchema,
  observedKind: ObservedModuleKindSchema,
  graph: Schema.optional(Schema.String),
  member: Schema.optional(Schema.String),
});

export type AnalyzedModule = typeof AnalyzedModuleSchema.Type;

export const AnalyzedModuleGraphSchema = Schema.Struct({
  id: Schema.String,
  layer: Schema.String,
  path: Schema.String,
  members: Schema.Array(Schema.String),
  rules: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});

export type AnalyzedModuleGraph = typeof AnalyzedModuleGraphSchema.Type;

export const ModuleViolationSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('coverage'), file: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('graph-coverage'),
    graph: Schema.String,
    file: Schema.String,
  }),
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
  Schema.Struct({
    kind: Schema.Literal('dead-module'),
    module: Schema.String,
  }),
]);

export type ModuleViolation = typeof ModuleViolationSchema.Type;

export const ModuleAnalysisSchema = Schema.Struct({
  modules: Schema.Array(AnalyzedModuleSchema),
  graphs: Schema.Array(AnalyzedModuleGraphSchema),
  membership: Schema.ReadonlyMap(Schema.String, Schema.String),
  entryPoints: Schema.ReadonlySet(Schema.String),
  dependencies: Schema.Array(ModuleDependencySchema),
  violations: Schema.Array(ModuleViolationSchema),
});

export type ModuleAnalysis = typeof ModuleAnalysisSchema.Type;
