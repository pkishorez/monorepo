import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Data, Effect } from 'effect';
import { createJiti } from 'jiti';

import {
  decision,
  exhaustive,
  flow,
  step,
  terminal,
  when,
} from '../../stories/authoring/index.js';
import { validateConfig } from '../define-config.js';
import type {
  Layer,
  LayerEdge,
  LayerGraph,
  LaymosConfig,
  ModuleDef,
  ModuleRules,
} from '../types.js';

export class ConfigNotFoundError extends Data.TaggedError(
  'ConfigNotFoundError',
)<{
  readonly path: string;
}> {}

export class ConfigImportError extends Data.TaggedError('ConfigImportError')<{
  readonly path: string;
  readonly message: string;
}> {}

export class ConfigValidationError extends Data.TaggedError(
  'ConfigValidationError',
)<{
  readonly path: string;
  readonly issues: readonly string[];
  readonly message: string;
}> {}

export type LoadConfigError =
  | ConfigNotFoundError
  | ConfigImportError
  | ConfigValidationError;

export interface LoadConfigRequest {
  readonly projectDir: string;
}

/** Loads and validates the Laymos config at the project root. */
export const loadConfig = flow(
  'Load project configuration',
  {
    description:
      'Locates, imports, normalizes, and semantically validates the Laymos configuration before project work begins.',
    attributes: ({ projectDir }: LoadConfigRequest) => ({ projectDir }),
  },
  ({
    projectDir,
  }: LoadConfigRequest): Effect.Effect<LaymosConfig, LoadConfigError> => {
    return Effect.gen(function* () {
      const located = yield* step(
        'Locate laymos.config.ts',
        {
          description:
            'Resolves the expected project-root path and asks the file system whether the configuration exists.',
        },
        () =>
          Effect.sync(() => {
            const path = resolve(projectDir, 'laymos.config.ts');
            return { path, exists: existsSync(path) };
          }),
      );
      return yield* decision(
        'Configuration file exists',
        {
          description:
            'Chooses whether configuration loading can continue or must stop before module execution.',
        },
        located.exists,
      ).pipe(
        when(
          false,
          {
            name: 'Missing',
            description:
              'Stop with the exact path because there is no configuration to interpret.',
            completion: {
              kind: 'error',
              error: 'ConfigNotFoundError',
            },
          },
          () =>
            terminal(
              'Configuration was not found',
              {
                description:
                  'Returns a typed not-found failure naming the expected project-root file.',
                completion: {
                  kind: 'error',
                  error: 'ConfigNotFoundError',
                },
              },
              () =>
                Effect.fail(new ConfigNotFoundError({ path: located.path })),
            ),
        ),
        when(
          true,
          {
            name: 'Found',
            description:
              'Import the authored TypeScript module and validate what it exports.',
            errors: ['ConfigImportError', 'ConfigValidationError'],
          },
          () => importAndValidateConfig(located.path),
        ),
        exhaustive,
      );
    });
  },
);

const importAndValidateConfig = flow(
  'Import and validate configuration',
  {
    description:
      'Executes the TypeScript module, checks its data shape, and applies semantic configuration rules.',
    attributes: (path: string) => ({ path }),
  },
  (path: string): Effect.Effect<LaymosConfig, LoadConfigError> =>
    Effect.gen(function* () {
      const config = yield* step(
        'Execute configuration module with jiti',
        {
          description:
            'Runs the TypeScript configuration without requiring a separate build and reads its default export.',
        },
        () =>
          Effect.tryPromise({
            try: async () => {
              const jiti = createJiti(import.meta.url, {
                interopDefault: true,
                moduleCache: false,
              });
              const imported = (await jiti.import(path)) as {
                default?: unknown;
              };
              return imported.default;
            },
            catch: (cause) =>
              new ConfigImportError({
                path,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          }),
      );
      return yield* decision(
        'Default export has the Laymos configuration shape',
        {
          description:
            'Separates malformed module exports from configurations that can be normalized and checked.',
        },
        isLaymosConfig(config),
      ).pipe(
        when(
          false,
          {
            name: 'Invalid shape',
            description:
              'Reject the export before semantic validation because required collections are absent or malformed.',
            completion: {
              kind: 'error',
              error: 'ConfigValidationError',
            },
          },
          () =>
            terminal(
              'Configuration export is invalid',
              {
                description:
                  'Returns the stable validation issue used when the default export is not a Laymos configuration.',
                completion: {
                  kind: 'error',
                  error: 'ConfigValidationError',
                },
              },
              () =>
                Effect.fail(
                  new ConfigValidationError({
                    path,
                    issues: [
                      'Config must default-export a value created with defineConfig()',
                    ],
                    message: `Invalid Laymos config at "${path}"`,
                  }),
                ),
            ),
        ),
        when(
          true,
          {
            name: 'Recognized shape',
            description:
              'Normalize paths and evaluate all semantic rules as one complete validation pass.',
            errors: ['ConfigValidationError'],
          },
          () => validateConfigurationSemantics(path, config as LaymosConfig),
        ),
        exhaustive,
      );
    }),
);

const validateConfigurationSemantics = flow(
  'Validate configuration semantics',
  {
    description:
      'Normalizes authored paths and collects every configuration issue so the user can fix them together.',
  },
  (
    path: string,
    config: LaymosConfig,
  ): Effect.Effect<LaymosConfig, ConfigValidationError> => {
    const validation = validateConfig(config);
    return decision(
      'Semantic validation found issues',
      {
        description:
          'Chooses between the normalized configuration and one typed failure containing every discovered issue.',
        attributes: (hasIssues) => ({
          hasIssues,
          issues: validation.issues.length,
        }),
      },
      validation.issues.length > 0,
    ).pipe(
      when(
        true,
        {
          name: 'Issues found',
          description:
            'Reject the configuration with the complete ordered issue list.',
          completion: {
            kind: 'error',
            error: 'ConfigValidationError',
          },
        },
        () =>
          terminal(
            'Configuration has semantic issues',
            {
              description:
                'Returns the normalized validation findings without hiding later issues behind the first one.',
              completion: {
                kind: 'error',
                error: 'ConfigValidationError',
              },
            },
            () =>
              Effect.fail(
                new ConfigValidationError({
                  path,
                  issues: validation.issues,
                  message: `Invalid Laymos config at "${path}":\n${validation.issues.map((issue) => `- ${issue}`).join('\n')}`,
                }),
              ),
          ),
      ),
      when(
        false,
        {
          name: 'Valid',
          description:
            'Expose the normalized configuration to the capability that requested it.',
          completion: { kind: 'success' },
        },
        () =>
          terminal(
            'Configuration is ready',
            {
              description:
                'Completes configuration loading with normalized paths and validated architectural intent.',
              completion: { kind: 'success' },
            },
            () => Effect.succeed(validation.config),
          ),
      ),
      exhaustive,
    );
  },
);

function isLaymosConfig(value: unknown): value is LaymosConfig {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.sourceRoots) &&
    Array.isArray(value.graphs) &&
    value.graphs.every(isLayerGraph) &&
    (value.modules === undefined ||
      (Array.isArray(value.modules) && value.modules.every(isModule))) &&
    (value.moduleRules === undefined ||
      (Array.isArray(value.moduleRules) &&
        value.moduleRules.every(isModuleRules))) &&
    (value.ignore === undefined || isStringArray(value.ignore)) &&
    (value.project === undefined || isProjectNarrative(value.project))
  );
}

function isLayerGraph(value: unknown): value is LayerGraph {
  return (
    isRecord(value) &&
    value.kind === 'layer-graph' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    Array.isArray(value.layers) &&
    value.layers.every(isLayer) &&
    Array.isArray(value.edges) &&
    value.edges.every(isLayerEdge)
  );
}

function isLayer(value: unknown): value is Layer {
  return (
    isRecord(value) &&
    value.kind === 'layer' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    isStringArray(value.paths)
  );
}

function isLayerEdge(value: unknown): value is LayerEdge {
  return isRecord(value) && isLayer(value.from) && isLayer(value.to);
}

function isModule(value: unknown): value is ModuleDef {
  return (
    isRecord(value) &&
    value.kind === 'module' &&
    typeof value.path === 'string' &&
    typeof value.description === 'string' &&
    (value.documentation === undefined ||
      isMarkdownContent(value.documentation))
  );
}

function isModuleRules(value: unknown): value is ModuleRules {
  return (
    isRecord(value) &&
    value.kind === 'module-rules' &&
    isModule(value.module) &&
    (value.canImport === undefined ||
      (Array.isArray(value.canImport) && value.canImport.every(isModule))) &&
    (value.canImportedBy === undefined ||
      (Array.isArray(value.canImportedBy) &&
        value.canImportedBy.every(isModule)))
  );
}

function isProjectNarrative(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === 'project-narrative' &&
    typeof value.name === 'string' &&
    isMarkdownContent(value.content)
  );
}

function isMarkdownContent(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.kind === 'markdown' &&
    typeof value.content === 'string'
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
