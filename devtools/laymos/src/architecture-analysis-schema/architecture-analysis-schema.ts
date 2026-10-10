import { Schema } from 'effect';

import { FindingSchema, ModuleImportSchema } from './import-schema.js';
import { ModuleTreeSchema } from './module-tree-schema.js';
import { ProjectConfigSchema } from './project-config-schema.js';

/**
 * The merged picture of one Project: the Module tree read from disk, the
 * Rules and Exceptions the Config declares, every import between nodes
 * classified against them, and the findings that are not imports.
 */
export const ArchitectureAnalysisSchema = Schema.Struct({
  config: ProjectConfigSchema,
  tree: ModuleTreeSchema,
  imports: Schema.Array(ModuleImportSchema),
  findings: Schema.Array(FindingSchema),
});

export type ArchitectureAnalysis = typeof ArchitectureAnalysisSchema.Type;
