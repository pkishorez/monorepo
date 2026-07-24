import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Data, Effect, Match, Option, Schema } from 'effect';
import { createJiti } from 'jiti';

import { validateConfig } from '../define-config.js';
import type {
  Layer,
  LayerEdge,
  LayerGraph,
  LaymosConfig,
  ModuleDef,
  ModuleRules,
} from '../types.js';

const ErrorMessageSchema = Schema.Struct({ message: Schema.String });
const UnknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown);

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
export const loadConfig = ({
  projectDir,
}: LoadConfigRequest): Effect.Effect<LaymosConfig, LoadConfigError> => {
  return Effect.gen(function* () {
    const located = yield* Effect.sync(() => {
      const path = resolve(projectDir, 'laymos.config.ts');
      return { path, exists: existsSync(path) };
    });
    return yield* Match.value(located.exists).pipe(
      Match.when(false, () =>
        Effect.fail(new ConfigNotFoundError({ path: located.path })),
      ),
      Match.when(true, () => importAndValidateConfig(located.path)),
      Match.exhaustive,
    );
  });
};

const importAndValidateConfig = (
  path: string,
): Effect.Effect<LaymosConfig, LoadConfigError> =>
  Effect.gen(function* () {
    const config = yield* Effect.tryPromise({
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
          message: errorMessage(cause),
        }),
    });
    return yield* Match.value(isLaymosConfig(config)).pipe(
      Match.when(false, () =>
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
      Match.when(true, () =>
        validateConfigurationSemantics(path, config as LaymosConfig),
      ),
      Match.exhaustive,
    );
  });

const validateConfigurationSemantics = (
  path: string,
  config: LaymosConfig,
): Effect.Effect<LaymosConfig, ConfigValidationError> => {
  const validation = validateConfig(config);
  return Match.value(validation.issues.length > 0).pipe(
    Match.when(true, () =>
      Effect.fail(
        new ConfigValidationError({
          path,
          issues: validation.issues,
          message: `Invalid Laymos config at "${path}":\n${validation.issues.map((issue) => `- ${issue}`).join('\n')}`,
        }),
      ),
    ),
    Match.when(false, () => Effect.succeed(validation.config)),
    Match.exhaustive,
  );
};

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
  return Schema.is(UnknownRecordSchema)(value);
}

function errorMessage(cause: unknown): string {
  const decoded = Schema.decodeUnknownOption(ErrorMessageSchema)(cause);
  return Option.isSome(decoded) ? decoded.value.message : String(cause);
}
