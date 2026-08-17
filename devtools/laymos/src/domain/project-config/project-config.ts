import { Schema } from 'effect';

import {
  ProjectConfigSchema,
  type Config,
  type ConfigValidationIssue,
} from '../../architecture-analysis-schema/index.js';
import { resolveConfig } from './resolve.js';
import { validateProjectConfig } from './validation/index.js';

export { ProjectConfigSchema };
export { resolveConfig };
export type { ResolvedConfig } from './resolve.js';
export type { Config, ConfigValidationIssue };

export function decodeProjectConfig(input: unknown) {
  return Schema.decodeUnknownEffect(ProjectConfigSchema)(input);
}

export function validateConfig(
  config: Config,
): readonly ConfigValidationIssue[] {
  return validateProjectConfig(config);
}

export function validateLoadedConfig(
  config: Config,
  files: Iterable<string>,
): readonly ConfigValidationIssue[] {
  const knownFiles = new Set(files);
  const exists = (path: string) =>
    knownFiles.has(path) ||
    [...knownFiles].some((file) => file.startsWith(`${path}/`));
  const { modules, graphs } = resolveConfig(config);
  return [
    ...Object.keys(modules)
      .filter((path) => !exists(path))
      .map((path) => ({
        kind: 'module' as const,
        message: `Module ${path} does not exist in the analysis universe`,
      })),
    ...Object.entries(graphs)
      .filter(([, graph]) => !exists(graph.path))
      .map(([id]) => ({
        kind: 'module-graph' as const,
        message: `Module Graph ${id} does not exist in the analysis universe`,
      })),
  ];
}

export function projectConfigJsonSchema(): Readonly<Record<string, unknown>> {
  const standard = Schema.toStandardJSONSchemaV1(ProjectConfigSchema);
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...standard['~standard'].jsonSchema.input({ target: 'draft-07' }),
  };
}
