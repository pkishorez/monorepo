import { Effect, Schema } from 'effect';

const ModuleSchema = Schema.Struct({
  shared: Schema.Boolean.annotate({
    description:
      'Whether peers in the same Layer may import this Module. Illegal inside a Module Graph, where Rules govern peer access.',
  }).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  exposed: Schema.Boolean.annotate({
    description: 'Whether other Layers may import this Module.',
  }).pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
}).annotate({
  title: 'Module',
  description:
    'A Configured Module keyed by its canonical source file or directory — project-relative when declared in a Layer, Module Graph-relative when declared in a Module Graph. Both flags default to false, so a Module is importable by nobody until it says otherwise.',
});

const ModuleGraphSchema = Schema.Struct({
  description: Schema.optional(Schema.String).annotate({
    description: 'Human-readable summary of this Module Graph.',
  }),
  path: Schema.String.annotate({
    description:
      'Canonical project-relative directory rooting this Module Graph. Every member lives below it and every file below it must belong to a member.',
  }),
  modules: Schema.Record(Schema.String, ModuleSchema)
    .annotate({
      description:
        'Every member of this Module Graph, keyed relative to its path. At least two members, at least one exposed, and no member may be Shared.',
    })
    .pipe(Schema.check(Schema.isMinProperties(2))),
  rules: Schema.Record(Schema.String, Schema.Array(Schema.String))
    .annotate({
      description:
        'Maps a member key to the member keys it may directly depend on. Rules are default-deny and, unlike LayerGraph Rules, are NOT transitive: only declared edges are permitted. They must be acyclic within this Module Graph.',
    })
    .pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed<Readonly<Record<string, readonly string[]>>>({}),
      ),
    ),
}).annotate({
  title: 'Module Graph',
  description:
    'A named, bounded set of Modules inside one Layer describing one capability too large for a single Module. Unlike a LayerGraph it is a disjoint unit: its Rules are never unioned with another Graph’s, are not transitive, and are checked for cycles on their own.',
});

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
  modules: Schema.Record(Schema.String, ModuleSchema)
    .annotate({
      description:
        'Every free-form Configured Module in this Layer, keyed by canonical project-relative source file or directory.',
    })
    .pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed<Readonly<Record<string, typeof ModuleSchema.Type>>>({}),
      ),
    ),
  moduleGraphs: Schema.Record(Schema.String, ModuleGraphSchema)
    .annotate({
      description: 'Every Module Graph in this Layer, keyed by id.',
    })
    .pipe(
      Schema.withDecodingDefaultKey(
        Effect.succeed<Readonly<Record<string, typeof ModuleGraphSchema.Type>>>(
          {},
        ),
      ),
    ),
}).annotate({
  title: 'Layer',
  description:
    'A named, configured group of project-relative paths, owning the Modules and Module Graphs declared within it.',
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

export const ProjectConfigSchema = Schema.Struct({
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
  storiesPath: Schema.optional(Schema.String).annotate({
    description:
      'Canonical project-relative folder holding every Story file and the index.ts entry point exposing the Story Collection. Implicitly an Ignored path.',
  }),
  layers: Schema.Record(Schema.String, LayerSchema)
    .annotate({
      description:
        'Every Layer in the project, keyed by id, each owning its Modules and Module Graphs.',
    })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  layerGraphs: Schema.Record(Schema.String, LayerGraphSchema).annotate({
    description:
      'Every LayerGraph in the project, keyed by id. An empty set denies every cross-Layer dependency.',
  }),
}).annotate({
  title: 'Laymos Config',
  description:
    "Declares a project's Layers, their Modules and Module Graphs, and its LayerGraphs.",
});

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
