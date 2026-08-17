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
  type AnalyzedModuleGraph,
  type ModuleAnalysis,
  type ModuleDefinition,
  type ModuleDependency,
  type ModuleGraphDefinition,
  type ModuleShape,
  type ModuleViolation,
  type ObservedModuleKind,
} from './module-analysis-schema.js';
import {
  ConfigValidationIssueSchema,
  ProjectConfigSchema,
  type Config,
  type ConfigValidationIssue,
  type ModuleConfig,
  type ModuleGraphConfig,
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
  AnalyzedModuleGraph,
  Config,
  ConfigValidationIssue,
  ForbiddenImport,
  LayerAnalysis,
  LayerDefinition,
  ModuleAnalysis,
  ModuleConfig,
  ModuleDefinition,
  ModuleDependency,
  ModuleGraphConfig,
  ModuleGraphDefinition,
  ModuleShape,
  ModuleViolation,
  ObservedModuleKind,
};
