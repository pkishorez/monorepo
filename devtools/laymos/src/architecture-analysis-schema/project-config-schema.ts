import { Effect, Schema } from 'effect';

const projectConfigAnnotations = {
  title: 'Laymos Config',
  description:
    'Where the source is, which single files are Modules, which paths are ignored, which Rules hold, and which Exceptions exist with a Reason. Folder Modules are never listed: a folder with an index file is a Module.',
};

const schemaField = Schema.optional(Schema.String).annotate({
  description:
    'JSON Schema URL, used by editors for autocomplete and validation.',
});

const sourceRootsField = Schema.Array(Schema.String)
  .annotate({
    description:
      'Project-relative files or folders that define the analysis universe. Git-ignored files are never part of it.',
  })
  .pipe(Schema.check(Schema.isMinLength(1)));

const IgnoredPathsSchema = Schema.Array(Schema.String).annotate({
  description:
    'Project-relative files or folders removed from the analysis universe, each with its whole subtree. The one way to keep a folder with an index file from being a Module.',
});

const storiesPathField = Schema.optional(Schema.String).annotate({
  description:
    'Project-relative folder holding the Story tree: it and every folder beneath it is a Story, told by its story.md, with its Proofs (*.proof.ts or *.proof.tsx) directly inside. Implicitly an Ignored path.',
});

const storyTimeoutField = Schema.optional(Schema.String).annotate({
  description:
    'How long one process Proof may run before it errors as timed out, as an Effect Duration string (e.g. "10 seconds"). Defaults to 10 seconds. Browser Proofs default to 90 seconds; a Proof may override either with its own timeout.',
});

const FileModulesSchema = Schema.Array(Schema.String).annotate({
  description:
    'Project-relative source files that are Modules of their own. The one kind of Module that must be declared, because a file carries no index to say so.',
});

const RulesSchema = Schema.Record(
  Schema.String,
  Schema.Array(Schema.String),
).annotate({
  description:
    'One-way permissions. Each key is a project-relative Wrapper or Module path, or "*" for every sibling of a target; each value lists the Wrapper or Module paths it may import. Every Module inside the key may import the Index of every Module inside each target. Rules do not chain.',
});

export const ExceptionSchema = Schema.Struct({
  from: Schema.String.annotate({
    description: 'Project-relative Wrapper or Module path doing the importing.',
  }),
  to: Schema.String.annotate({
    description: 'Project-relative Wrapper or Module path being imported.',
  }),
  because: Schema.String.pipe(Schema.check(Schema.isMinLength(1))).annotate({
    description: 'The Reason this Exception exists. Mandatory.',
  }),
}).annotate({
  title: 'Exception',
  description:
    'One import no Rule could hold, allowed on purpose: a child importing an ancestor, or an import against a Rule that would make a Rule loop.',
});

const ExceptionsSchema = Schema.Array(ExceptionSchema).annotate({
  description: 'Every Exception, each with its Reason.',
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
  storyTimeout: storyTimeoutField,
  fileModules: FileModulesSchema,
  rules: RulesSchema,
  exceptions: ExceptionsSchema,
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
  storyTimeout: storyTimeoutField,
  fileModules: FileModulesSchema.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<readonly string[]>([])),
  ),
  rules: RulesSchema.pipe(
    Schema.withDecodingDefaultKey(
      Effect.succeed<Readonly<Record<string, readonly string[]>>>({}),
    ),
  ),
  exceptions: ExceptionsSchema.pipe(
    Schema.withDecodingDefaultKey(
      Effect.succeed<readonly (typeof ExceptionSchema.Type)[]>([]),
    ),
  ),
}).annotate(projectConfigAnnotations);

export type Config = typeof ProjectConfigSchema.Type;

export type ConfigException = typeof ExceptionSchema.Type;

export const ConfigValidationIssueSchema = Schema.Struct({
  kind: Schema.Literals(['path', 'rule', 'loop', 'exception']),
  message: Schema.String,
}).annotate({
  title: 'Config Validation Issue',
  description: 'A single problem found while validating a Laymos Config.',
});

export type ConfigValidationIssue = typeof ConfigValidationIssueSchema.Type;
