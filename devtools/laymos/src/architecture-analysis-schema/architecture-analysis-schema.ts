import { Schema } from 'effect';

import {
  LayerAnalysisSchema,
  type ForbiddenImport,
  type LayerAnalysis,
  type LayerDefinition,
} from './layer-analysis-schema.js';
import {
  ModuleAnalysisSchema,
  type AnalyzedModule,
  type ModuleAnalysis,
  type ModuleDefinition,
  type ModuleDependency,
  type ModuleKind,
  type ModuleShape,
  type ModuleViolation,
  type ObservedModuleKind,
} from './module-analysis-schema.js';
import {
  ConfigValidationIssueSchema,
  ProjectConfigSchema,
  type Config,
  type ConfigValidationIssue,
} from './project-config-schema.js';

export const ArchitectureAnalysisSchema = Schema.Struct({
  config: ProjectConfigSchema,
  layerAnalysis: LayerAnalysisSchema,
  moduleAnalysis: ModuleAnalysisSchema,
});

export type ArchitectureAnalysis = typeof ArchitectureAnalysisSchema.Type;

export {
  ConfigValidationIssueSchema,
  LayerAnalysisSchema,
  ModuleAnalysisSchema,
  ProjectConfigSchema,
};
export type {
  AnalyzedModule,
  Config,
  ConfigValidationIssue,
  ForbiddenImport,
  LayerAnalysis,
  LayerDefinition,
  ModuleAnalysis,
  ModuleDefinition,
  ModuleDependency,
  ModuleKind,
  ModuleShape,
  ModuleViolation,
  ObservedModuleKind,
};
