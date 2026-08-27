import { Effect, Schema } from 'effect';

const moduleAnnotations = {
  title: 'Module',
  description:
    'A Configured Module keyed by its canonical source file or directory — project-relative when declared in a Layer, Module Graph-relative when declared in a Module Graph. Both flags default to false, so a Module is importable by nobody until it says otherwise.',
};

const SharedSchema = Schema.Boolean.annotate({
  description:
    'Whether peers in the same Layer may import this Module. Illegal inside a Module Graph, where Rules govern peer access.',
});

const ExposedSchema = Schema.Boolean.annotate({
  description: 'Whether other Layers may import this Module.',
});

const ModuleSchema = Schema.Struct({
  shared: SharedSchema,
  exposed: ExposedSchema,
}).annotate(moduleAnnotations);

const ModuleInputSchema = Schema.Struct({
  shared: SharedSchema.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
  ),
  exposed: ExposedSchema.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
  ),
}).annotate(moduleAnnotations);

const moduleGraphAnnotations = {
  title: 'Module Graph',
  description:
    'A named, bounded set of Modules inside one Layer describing one capability too large for a single Module. Unlike a LayerGraph it is a disjoint unit: its Rules are never unioned with another Graph’s, are not transitive, and are checked for cycles on their own.',
};

const graphDescriptionField = Schema.optional(Schema.String).annotate({
  description: 'Human-readable summary of this Module Graph.',
});

const graphPathField = Schema.String.annotate({
  description:
    'Canonical project-relative directory rooting this Module Graph. Every member lives below it and every file below it must belong to a member.',
});

const docsPathField = Schema.optional(Schema.String).annotate({
  description:
    'Canonical project-relative path to a markdown file documenting this entity. Read-only: Laymos never writes to it.',
});

const graphModulesDescription =
  'Every member of this Module Graph, keyed relative to its path. At least two members, at least one exposed, and no member may be Shared.';

const graphRulesDescription =
  'Maps a member key to the member keys it may directly depend on. Rules are default-deny and, unlike LayerGraph Rules, are NOT transitive: only declared edges are permitted. They must be acyclic within this Module Graph.';

const GraphRulesSchema = Schema.Record(
  Schema.String,
  Schema.Array(Schema.String),
).annotate({ description: graphRulesDescription });

const ModuleGraphSchema = Schema.Struct({
  description: graphDescriptionField,
  path: graphPathField,
  docsPath: docsPathField,
  modules: Schema.Record(Schema.String, ModuleSchema)
    .annotate({ description: graphModulesDescription })
    .pipe(Schema.check(Schema.isMinProperties(2))),
  rules: GraphRulesSchema,
}).annotate(moduleGraphAnnotations);

const ModuleGraphInputSchema = Schema.Struct({
  description: graphDescriptionField,
  path: graphPathField,
  docsPath: docsPathField,
  modules: Schema.Record(Schema.String, ModuleInputSchema)
    .annotate({ description: graphModulesDescription })
    .pipe(Schema.check(Schema.isMinProperties(2))),
  rules: GraphRulesSchema.pipe(
    Schema.withDecodingDefaultKey(
      Effect.succeed<Readonly<Record<string, readonly string[]>>>({}),
    ),
  ),
}).annotate(moduleGraphAnnotations);

const layerAnnotations = {
  title: 'Layer',
  description:
    'A named, configured group of project-relative paths, owning the Modules and Module Graphs declared within it.',
};

const layerPathsField = Schema.Array(Schema.String)
  .annotate({
    description:
      'Canonical project-relative paths belonging to this Layer. No declared Layer scopes may overlap, within one Layer or across Layers.',
  })
  .pipe(Schema.check(Schema.isMinLength(1)));

const layerDescriptionField = Schema.optional(Schema.String).annotate({
  description: 'Human-readable summary of this Layer.',
});

const layerModulesDescription =
  'Every free-form Configured Module in this Layer, keyed by canonical project-relative source file or directory.';

const layerModuleGraphsDescription =
  'Every Module Graph in this Layer, keyed by id.';

const LayerSchema = Schema.Struct({
  paths: layerPathsField,
  description: layerDescriptionField,
  docsPath: docsPathField,
  modules: Schema.Record(Schema.String, ModuleSchema).annotate({
    description: layerModulesDescription,
  }),
  moduleGraphs: Schema.Record(Schema.String, ModuleGraphSchema).annotate({
    description: layerModuleGraphsDescription,
  }),
}).annotate(layerAnnotations);

const LayerInputSchema = Schema.Struct({
  paths: layerPathsField,
  description: layerDescriptionField,
  docsPath: docsPathField,
  modules: Schema.Record(Schema.String, ModuleInputSchema)
    .annotate({ description: layerModulesDescription })
    .pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed<Readonly<Record<string, typeof ModuleSchema.Type>>>({}),
      ),
    ),
  moduleGraphs: Schema.Record(Schema.String, ModuleGraphInputSchema)
    .annotate({ description: layerModuleGraphsDescription })
    .pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed<Readonly<Record<string, typeof ModuleGraphSchema.Type>>>(
          {},
        ),
      ),
    ),
}).annotate(layerAnnotations);

const LayerGraphSchema = Schema.Struct({
  description: Schema.optional(Schema.String).annotate({
    description: 'Human-readable summary of this LayerGraph.',
  }),
  docsPath: docsPathField,
  rules: Schema.Record(Schema.String, Schema.Array(Schema.String)).annotate({
    description:
      'Maps a Layer id to the Layer ids it may directly depend on. Rules are default-deny and transitive: a dependency between two Layers with no declared path between them, direct or transitive, is a violation. A Layer with no outgoing rule is a valid, intentional leaf.',
  }),
}).annotate({
  title: 'LayerGraph',
  description:
    'A named set of Rules representing one responsibility (e.g. core architecture, test boundaries). This is an organizational grouping, not an enforcement boundary — enforcement unions every Rule declared across every LayerGraph in the project.',
});

const projectConfigAnnotations = {
  title: 'Laymos Config',
  description:
    "Declares a project's Layers, their Modules and Module Graphs, and its LayerGraphs.",
};

const schemaField = Schema.optional(Schema.String).annotate({
  description:
    'JSON Schema URL, used by editors for autocomplete and validation.',
});

const sourceRootsField = Schema.Array(Schema.String)
  .annotate({
    description:
      'Canonical project-relative files or folders that define the complete static analysis universe.',
  })
  .pipe(Schema.check(Schema.isMinLength(1)));

const IgnoredPathsSchema = Schema.Array(Schema.String).annotate({
  description:
    'Canonical project-relative files or folders explicitly excluded from the analysis universe.',
});

const storiesPathField = Schema.optional(Schema.String).annotate({
  description:
    'Canonical project-relative folder holding every Story file and the index.ts entry point exposing the Story Collection. Implicitly an Ignored path.',
});

const layersDescription =
  'Every Layer in the project, keyed by id, each owning its Modules and Module Graphs.';

const layerGraphsField = Schema.Record(
  Schema.String,
  LayerGraphSchema,
).annotate({
  description:
    'Every LayerGraph in the project, keyed by id. An empty set denies every cross-Layer dependency.',
});

/**
 * The wire contract. Every key is required and no field carries decoding
 * middleware, so an encoded Config round-trips byte-for-byte and stays
 * decodable by a Schema runtime other than the one that built this module.
 */
export const ProjectConfigSchema = Schema.Struct({
  $schema: schemaField,
  sourceRoots: sourceRootsField,
  ignoredPaths: IgnoredPathsSchema,
  storiesPath: storiesPathField,
  layers: Schema.Record(Schema.String, LayerSchema)
    .annotate({ description: layersDescription })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  layerGraphs: layerGraphsField,
}).annotate(projectConfigAnnotations);

/**
 * The authoring contract for laymos.config.json, where optional keys fall back
 * to their documented defaults. Decodes to the same value as
 * {@link ProjectConfigSchema}.
 */
export const ProjectConfigInputSchema = Schema.Struct({
  $schema: schemaField,
  sourceRoots: sourceRootsField,
  ignoredPaths: IgnoredPathsSchema.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<readonly string[]>([])),
  ),
  storiesPath: storiesPathField,
  layers: Schema.Record(Schema.String, LayerInputSchema)
    .annotate({ description: layersDescription })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  layerGraphs: layerGraphsField,
}).annotate(projectConfigAnnotations);

export type Config = typeof ProjectConfigSchema.Type;

export type ModuleConfig = typeof ModuleSchema.Type;

export type ModuleGraphConfig = typeof ModuleGraphSchema.Type;

export const ConfigValidationIssueSchema = Schema.Struct({
  kind: Schema.Literals([
    'path',
    'overlap',
    'reference',
    'cycle',
    'module',
    'module-graph',
  ]),
  message: Schema.String,
}).annotate({
  title: 'Config Validation Issue',
  description: 'A single problem found while validating a Laymos Config.',
});

export type ConfigValidationIssue = typeof ConfigValidationIssueSchema.Type;
