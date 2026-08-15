import { Effect, Schema } from 'effect';

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
  kind: Schema.Literals(['normal', 'shared', 'entry'])
    .annotate({
      description:
        'Configured access rule. Normal is the default. Shared adds same-Layer access. Entry Modules cannot be depended on by another Module.',
    })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed('normal' as const))),
  subpaths: Schema.Array(Schema.String)
    .annotate({
      description:
        'Exact paths whose index.ts files are extra public doors for tree shaking. Entry and File Modules cannot use this field.',
    })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed<readonly string[]>([]))),
}).annotate({
  title: 'Module',
  description:
    'A Configured Module keyed by its canonical project-relative source file or directory. Normal and Shared Modules expose public doors; Entry Modules cannot be depended on.',
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
      description: 'Every Layer in the project, keyed by id.',
    })
    .pipe(Schema.check(Schema.isMinProperties(1))),
  modules: Schema.Record(Schema.String, ModuleSchema)
    .annotate({
      description:
        'Every Configured Module, keyed by canonical project-relative source file or directory.',
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

export type Config = typeof ProjectConfigSchema.Type;

export const ConfigValidationIssueSchema = Schema.Struct({
  kind: Schema.Literals(['path', 'overlap', 'reference', 'cycle', 'module']),
  message: Schema.String,
}).annotate({
  title: 'Config Validation Issue',
  description: 'A single problem found while validating a Laymos Config.',
});

export type ConfigValidationIssue = typeof ConfigValidationIssueSchema.Type;
