import { Context, Effect, FileSystem, Layer, Schema } from 'effect';

import { ConfigError } from './errors.js';
import { validateConfig } from './validation/index.js';

const LayerSchema = Schema.Struct({
  paths: Schema.Array(Schema.String)
    .annotate({
      description:
        'Canonical project-relative paths belonging to this Layer. No declared Layer scopes may overlap, within one Layer or across Layers.',
    })
    .pipe(Schema.check(Schema.isMinLength(1))),
  description: Schema.optional(Schema.String).annotate({
    description: 'Human-readable summary of this Layer.',
  }),
}).annotate({
  title: 'Layer',
  description: 'A named, configured group of project-relative paths.',
});

const LayerGraphSchema = Schema.Struct({
  description: Schema.optional(Schema.String).annotate({
    description: 'Human-readable summary of this LayerGraph.',
  }),
  rules: Schema.Record(Schema.String, Schema.Array(Schema.String)).annotate({
    description:
      'Maps a Layer id to the Layer ids it may directly depend on. Rules are default-deny and transitive: a dependency between two Layers with no declared path between them, direct or transitive, is a violation. A Layer with no outgoing rule is a valid, intentional leaf.',
  }),
}).annotate({
  title: 'LayerGraph',
  description:
    'A named set of Rules representing one responsibility (e.g. core architecture, test boundaries). This is an organizational grouping, not an enforcement boundary — enforcement unions every Rule declared across every LayerGraph in the project.',
});

const ModuleSchema = Schema.Struct({
  shared: Schema.Boolean.annotate({
    description:
      'Allows every other Configured Module in the same Layer to depend on this Configured Module and requires its root index.ts.',
  }).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  nested: Schema.Array(Schema.String)
    .annotate({
      description:
        'Nested Module paths whose index.ts files are exposed outside the Configured Module. A non-empty list also requires the Configured Module root index.ts.',
    })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed<readonly string[]>([]))),
}).annotate({
  title: 'Module',
  description:
    'A Configured Module keyed by its canonical project-relative root directory. Without index.ts, Shared status, or exposed Nested Modules, it is an Unexposed Module that cannot be consumed.',
});

const ConfigSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String).annotate({
    description:
      'JSON Schema URL, used by editors for autocomplete and validation.',
  }),
  sourceRoots: Schema.Array(Schema.String)
    .annotate({
      description:
        'Canonical project-relative files or folders that define the complete static analysis universe.',
    })
    .pipe(Schema.check(Schema.isMinLength(1))),
  ignoredPaths: Schema.Array(Schema.String)
    .annotate({
      description:
        'Canonical project-relative files or folders explicitly excluded from the analysis universe.',
    })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed<readonly string[]>([]))),
  layers: Schema.Record(Schema.String, LayerSchema)
    .annotate({
      description: 'Every Layer in the project, keyed by id.',
    })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  modules: Schema.Record(Schema.String, ModuleSchema)
    .annotate({
      description:
        'Every Configured Module, keyed by canonical project-relative root directory.',
    })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  layerGraphs: Schema.Record(Schema.String, LayerGraphSchema).annotate({
    description:
      'Every LayerGraph in the project, keyed by id. An empty set denies every cross-Layer dependency.',
  }),
}).annotate({
  title: 'Laymos Config',
  description: "Declares a project's Layers, Modules, and LayerGraphs.",
});

export type Config = typeof ConfigSchema.Type;

const decodeConfig = Schema.decodeUnknownEffect(ConfigSchema);

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly read: (filePath: string) => Effect.Effect<Config, ConfigError>;
  }
>()('ConfigService') {
  static jsonSchema(): Readonly<Record<string, unknown>> {
    const standard = Schema.toStandardJSONSchemaV1(ConfigSchema);
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      ...standard['~standard'].jsonSchema.input({ target: 'draft-07' }),
    };
  }
}

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    return {
      read: (filePath: string) =>
        Effect.gen(function* () {
          const raw = yield* fs.readFileString(filePath).pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({
                  reason: 'read',
                  filePath,
                  cause,
                  issues: [],
                }),
            ),
          );

          const json = yield* Effect.try({
            try: () => JSON.parse(raw) as unknown,
            catch: (cause) =>
              new ConfigError({
                reason: 'parse',
                filePath,
                cause,
                issues: [],
              }),
          });

          const decoded = yield* decodeConfig(json).pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({
                  reason: 'schema',
                  filePath,
                  cause,
                  issues: [],
                }),
            ),
          );

          const issues = validateConfig(decoded);
          if (issues.length > 0) {
            return yield* new ConfigError({
              reason: 'validation',
              filePath,
              cause: issues,
              issues,
            });
          }

          return decoded;
        }).pipe(Effect.withSpan('config.read')),
    };
  }),
);
