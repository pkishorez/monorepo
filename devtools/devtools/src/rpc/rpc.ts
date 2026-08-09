import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { LotelRpc } from '@pkishorez/lotel/rpc';
import {
  ArchitectureAnalysisSchema,
  ConfigValidationIssueSchema,
  ModuleSourceSnapshotSchema,
} from 'laymos/architecture-analysis-schema';

export class InvalidProjectPath extends Schema.TaggedErrorClass<InvalidProjectPath>(
  'InvalidProjectPath',
)('InvalidProjectPath', {
  reason: Schema.Literals(['relative', 'not-found', 'not-directory']),
}) {}

export class ConfigReadError extends Schema.TaggedErrorClass<ConfigReadError>(
  'ConfigReadError',
)('ConfigReadError', { message: Schema.String }) {}

export class ConfigParseError extends Schema.TaggedErrorClass<ConfigParseError>(
  'ConfigParseError',
)('ConfigParseError', { message: Schema.String }) {}

export class ConfigSchemaError extends Schema.TaggedErrorClass<ConfigSchemaError>(
  'ConfigSchemaError',
)('ConfigSchemaError', { message: Schema.String }) {}

export class ConfigValidationError extends Schema.TaggedErrorClass<ConfigValidationError>(
  'ConfigValidationError',
)('ConfigValidationError', {
  issues: Schema.Array(ConfigValidationIssueSchema),
}) {}

export class SourceAnalysisError extends Schema.TaggedErrorClass<SourceAnalysisError>(
  'SourceAnalysisError',
)('SourceAnalysisError', {
  message: Schema.String,
  baseDir: Schema.optional(Schema.String),
}) {}

export class ModuleSourceNotFoundError extends Schema.TaggedErrorClass<ModuleSourceNotFoundError>(
  'ModuleSourceNotFoundError',
)('ModuleSourceNotFoundError', { modulePath: Schema.String }) {}

export class ModuleSourceReadError extends Schema.TaggedErrorClass<ModuleSourceReadError>(
  'ModuleSourceReadError',
)('ModuleSourceReadError', {
  filePath: Schema.String,
  message: Schema.String,
}) {}

const AnalyzeLaymosProjectError = Schema.Union([
  InvalidProjectPath,
  ConfigReadError,
  ConfigParseError,
  ConfigSchemaError,
  ConfigValidationError,
  SourceAnalysisError,
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
);

export const DevtoolsRpc = LotelRpc.merge(DevtoolsToolRpc);
