import { Schema } from 'effect';

import {
  ProjectConfigSchema,
  type Config,
  type ConfigValidationIssue,
} from '../../architecture-analysis-schema/index.js';
import { validateProjectConfig } from './validation/index.js';

export { ProjectConfigSchema };
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
  return Object.entries(config.modules).flatMap(([path, definition]) => {
    if (knownFiles.has(path)) {
      return definition.nested.length === 0
        ? []
        : [
            {
              kind: 'module' as const,
              message: `File Module ${path} cannot expose nested public entry points`,
            },
          ];
    }
    return [...knownFiles].some((file) => file.startsWith(`${path}/`))
      ? []
      : [
          {
            kind: 'module' as const,
            message: `Module ${path} does not exist in the analysis universe`,
          },
        ];
  });
}

export function projectConfigJsonSchema(): Readonly<Record<string, unknown>> {
  const standard = Schema.toStandardJSONSchemaV1(ProjectConfigSchema);
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...standard['~standard'].jsonSchema.input({ target: 'draft-07' }),
  };
}
