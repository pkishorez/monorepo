import { Context, Effect, FileSystem, Layer, Schema } from 'effect';

import { ConfigError } from './errors.js';

const LayerSchema = Schema.Struct({
  paths: Schema.Array(Schema.String)
    .annotate({
      description:
        'Project-relative paths belonging to this Layer. Layers are disjoint — no path may belong to more than one Layer.',
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

const ConfigSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String).annotate({
    description:
      'JSON Schema URL, used by editors for autocomplete and validation.',
  }),
  sourceRoots: Schema.Array(Schema.String)
    .annotate({
      description:
        'Project-relative files or folders that define the complete static analysis universe.',
    })
    .pipe(Schema.check(Schema.isMinLength(1))),
  layers: Schema.Record(Schema.String, LayerSchema)
    .annotate({
      description: 'Every Layer in the project, keyed by id.',
    })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  layerGraphs: Schema.Record(Schema.String, LayerGraphSchema)
    .annotate({
      description:
        'Every LayerGraph in the project, keyed by id. At least one LayerGraph is required.',
    })
    .pipe(Schema.check(Schema.isMinProperties(1))),
}).annotate({
  title: 'Laymos Config',
  description: "Declares a project's Layers and LayerGraphs.",
});

export type Config = typeof ConfigSchema.Type;

const decodeConfig = Schema.decodeUnknownEffect(ConfigSchema);

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly read: (filePath: string) => Effect.Effect<Config, ConfigError>;
  }
>()('ConfigService') {
  static jsonSchema() {
    return Schema.toJsonSchemaDocument(ConfigSchema);
  }
}

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    return {
      read: (filePath: string) =>
        Effect.gen(function* () {
          const raw = yield* fs
            .readFileString(filePath)
            .pipe(
              Effect.mapError(
                (cause) => new ConfigError({ reason: 'read', filePath, cause }),
              ),
            );

          const json = yield* Effect.try({
            try: () => JSON.parse(raw) as unknown,
            catch: (cause) =>
              new ConfigError({ reason: 'parse', filePath, cause }),
          });

          return yield* decodeConfig(json).pipe(
            Effect.mapError(
              (cause) => new ConfigError({ reason: 'schema', filePath, cause }),
            ),
          );
        }).pipe(Effect.withSpan('config.read')),
    };
  }),
);
