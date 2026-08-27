import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { LotelRpc } from '@pkishorez/lotel/rpc';
import {
  ArchitectureAnalysisSchema,
  ConfigValidationIssueSchema,
  DocumentationScopeSchema,
  DocumentationSchema,
  ModuleSourceFileSchema,
  ModuleSourceSnapshotSchema,
} from 'laymos/architecture-analysis-schema';
import {
  BranchSchema,
  ChangeSetSchema,
  FileDiffSchema,
} from 'laymos/change-set-schema';
import { StoryReportSchema, StoryTreeSchema } from 'laymos/story/schema';

export class InvalidProjectPath extends Schema.TaggedError<InvalidProjectPath>(
  'InvalidProjectPath',
)('InvalidProjectPath', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
}) {}

export class ConfigReadError extends Schema.TaggedError<ConfigReadError>(
  'ConfigReadError',
)('ConfigReadError', { message: Schema.String }) {}

export class ConfigParseError extends Schema.TaggedError<ConfigParseError>(
  'ConfigParseError',
)('ConfigParseError', { message: Schema.String }) {}

export class ConfigSchemaError extends Schema.TaggedError<ConfigSchemaError>(
  'ConfigSchemaError',
)('ConfigSchemaError', { message: Schema.String }) {}

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>(
  'ConfigValidationError',
)('ConfigValidationError', {
  issues: Schema.Array(ConfigValidationIssueSchema),
}) {}

export class SourceAnalysisError extends Schema.TaggedError<SourceAnalysisError>(
  'SourceAnalysisError',
)('SourceAnalysisError', {
  message: Schema.String,
  baseDir: Schema.optional(Schema.String),
}) {}

export class ModuleSourceNotFoundError extends Schema.TaggedError<ModuleSourceNotFoundError>(
  'ModuleSourceNotFoundError',
)('ModuleSourceNotFoundError', { modulePath: Schema.String }) {}

export class ModuleSourceReadError extends Schema.TaggedError<ModuleSourceReadError>(
  'ModuleSourceReadError',
)('ModuleSourceReadError', {
  filePath: Schema.String,
  message: Schema.String,
}) {}

export class SourceFileReadError extends Schema.TaggedError<SourceFileReadError>(
  'SourceFileReadError',
)('SourceFileReadError', {
  filePath: Schema.String,
  message: Schema.String,
}) {}

export class DocumentationScopeNotFoundError extends Schema.TaggedError<DocumentationScopeNotFoundError>(
  'DocumentationScopeNotFoundError',
)('DocumentationScopeNotFoundError', { scope: DocumentationScopeSchema }) {}

export class DocumentationReadError extends Schema.TaggedError<DocumentationReadError>(
  'DocumentationReadError',
)('DocumentationReadError', {
  path: Schema.String,
  message: Schema.String,
}) {}

export class StoriesUnavailableError extends Schema.TaggedError<StoriesUnavailableError>(
  'StoriesUnavailableError',
)('StoriesUnavailableError', {
  reason: Schema.Literals([
    'no-stories-path',
    'load',
    'invalid-root',
    'duplicate-title',
    'duplicate-question',
    'snippet-extraction',
    'unknown-scope',
  ]),
  path: Schema.String,
}) {}

export class GitUnavailableError extends Schema.TaggedError<GitUnavailableError>(
  'GitUnavailableError',
)('GitUnavailableError', {
  reason: Schema.Literals(['not-a-repo', 'unknown-ref', 'command-failed']),
}) {}

const LaymosChangesError = Schema.Union([
  InvalidProjectPath,
  GitUnavailableError,
]);

const AnalyzeLaymosProjectError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  SourceAnalysisError,
]);

const LaymosStoriesError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  StoriesUnavailableError,
]);

const GetLaymosModuleSourceError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  SourceAnalysisError,
  ModuleSourceNotFoundError,
  ModuleSourceReadError,
]);

const GetLaymosSourceFilesError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  SourceAnalysisError,
  SourceFileReadError,
]);

const GetLaymosDocumentationError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  SourceAnalysisError,
  DocumentationScopeNotFoundError,
  DocumentationReadError,
]);

export const DevtoolsToolRpc = RpcGroup.make(
  Rpc.make('AnalyzeLaymosProject', {
    payload: { projectPath: Schema.String },
    success: ArchitectureAnalysisSchema,
    error: AnalyzeLaymosProjectError,
  }),
  Rpc.make('GetLaymosModuleSource', {
    payload: { projectPath: Schema.String, modulePath: Schema.String },
    success: ModuleSourceSnapshotSchema,
    error: GetLaymosModuleSourceError,
  }),
  Rpc.make('GetLaymosSourceFiles', {
    payload: {
      projectPath: Schema.String,
      pathPrefixes: Schema.Array(Schema.String),
    },
    success: Schema.Struct({ files: Schema.Array(ModuleSourceFileSchema) }),
    error: GetLaymosSourceFilesError,
  }),
  Rpc.make('GetLaymosDocumentation', {
    payload: { projectPath: Schema.String, scope: DocumentationScopeSchema },
    success: DocumentationSchema,
    error: GetLaymosDocumentationError,
  }),
  Rpc.make('GetLaymosBranches', {
    payload: { projectPath: Schema.String },
    success: Schema.Array(BranchSchema),
    error: LaymosChangesError,
  }),
  Rpc.make('GetLaymosChanges', {
    payload: {
      projectPath: Schema.String,
      baseRef: Schema.optional(Schema.String),
    },
    success: ChangeSetSchema,
    error: LaymosChangesError,
  }),
  Rpc.make('GetLaymosFileDiff', {
    payload: {
      projectPath: Schema.String,
      path: Schema.String,
      baseRef: Schema.optional(Schema.String),
    },
    success: FileDiffSchema,
    error: LaymosChangesError,
  }),
  Rpc.make('GetLaymosStories', {
    payload: { projectPath: Schema.String },
    success: StoryTreeSchema,
    error: LaymosStoriesError,
  }),
  Rpc.make('RunLaymosStories', {
    payload: {
      projectPath: Schema.String,
      scope: Schema.optional(Schema.String),
    },
    success: StoryReportSchema,
    error: LaymosStoriesError,
    stream: true,
  }),
);

export const DevtoolsRpc = LotelRpc.merge(DevtoolsToolRpc);
