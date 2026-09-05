import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';
import { EntityMetaSchema, SingleEntityMetaSchema } from '../core/index.js';
import { EncodedDataSchema } from '../db/std-table/contract/index.js';
import { TableSnapshotSchema } from '../snapshot/index.js';

const StringRecordSchema = Schema.Record(Schema.String, Schema.String);

const EncodedEntitySchema = Schema.Struct({
  value: EncodedDataSchema,
  meta: EntityMetaSchema,
});

const EncodedSingleEntitySchema = Schema.Struct({
  value: EncodedDataSchema,
  meta: SingleEntityMetaSchema,
});

const StudioEntitySchema = Schema.Union([
  EncodedEntitySchema,
  EncodedSingleEntitySchema,
]);

const QuerySortSchema = Schema.Union([
  Schema.Struct({
    operator: Schema.Literals(['=', 'beginsWith']),
    value: StringRecordSchema,
  }),
  Schema.Struct({
    operator: Schema.Literals(['<', '<=', '>', '>=']),
    value: Schema.NullOr(StringRecordSchema),
  }),
  Schema.Struct({
    operator: Schema.Literal('between'),
    value: Schema.Tuple([StringRecordSchema, StringRecordSchema]),
  }),
]);

export const GetEntityPayloadSchema = Schema.Struct({
  entity: Schema.String,
  key: Schema.optional(StringRecordSchema),
});

export const QueryEntitiesPayloadSchema = Schema.Struct({
  entity: Schema.String,
  accessPattern: Schema.String,
  pk: StringRecordSchema,
  sk: Schema.optional(QuerySortSchema),
  limit: Schema.optional(Schema.Int),
  after: Schema.optional(EncodedEntitySchema),
});

export type GetEntityPayload = typeof GetEntityPayloadSchema.Type;
export type QueryEntitiesPayload = typeof QueryEntitiesPayloadSchema.Type;

export interface StudioValidationIssue {
  readonly path: readonly string[];
  readonly message: string;
}

const StudioValidationIssueSchema = Schema.Struct({
  path: Schema.Array(Schema.String),
  message: Schema.String,
});

export class StudioUnknownEntity extends Schema.TaggedError<StudioUnknownEntity>()(
  'StudioUnknownEntity',
  { entity: Schema.String },
) {}

export class StudioWrongEntityKind extends Schema.TaggedError<StudioWrongEntityKind>()(
  'StudioWrongEntityKind',
  {
    entity: Schema.String,
    expected: Schema.Literals(['keyed', 'single']),
    actual: Schema.Literals(['keyed', 'single']),
  },
) {}

export class StudioUnknownAccessPattern extends Schema.TaggedError<StudioUnknownAccessPattern>()(
  'StudioUnknownAccessPattern',
  { entity: Schema.String, accessPattern: Schema.String },
) {}

export class StudioInvalidInput extends Schema.TaggedError<StudioInvalidInput>()(
  'StudioInvalidInput',
  { issues: Schema.Array(StudioValidationIssueSchema) },
) {}

export class StudioEntityCodecFailed extends Schema.TaggedError<StudioEntityCodecFailed>()(
  'StudioEntityCodecFailed',
  {
    entity: Schema.String,
    direction: Schema.Literals([
      'decode-after',
      'decode-read',
      'encode-result',
    ]),
  },
) {}

export class StudioReadFailed extends Schema.TaggedError<StudioReadFailed>()(
  'StudioReadFailed',
  {
    entity: Schema.String,
    operation: Schema.Literals(['get', 'query']),
  },
) {}

export class StudioSnapshotFailed extends Schema.TaggedError<StudioSnapshotFailed>()(
  'StudioSnapshotFailed',
  { message: Schema.String },
) {}

const GetEntityError = Schema.Union([
  StudioUnknownEntity,
  StudioInvalidInput,
  StudioEntityCodecFailed,
  StudioReadFailed,
]);

const QueryEntitiesError = Schema.Union([
  StudioUnknownEntity,
  StudioWrongEntityKind,
  StudioUnknownAccessPattern,
  StudioInvalidInput,
  StudioEntityCodecFailed,
  StudioReadFailed,
]);

export const GetTableSnapshotRpc = Rpc.make('Studio.GetTableSnapshot', {
  success: TableSnapshotSchema,
  error: StudioSnapshotFailed,
});

export const GetEntityRpc = Rpc.make('Studio.GetEntity', {
  payload: GetEntityPayloadSchema,
  success: Schema.NullOr(StudioEntitySchema),
  error: GetEntityError,
});

export const QueryEntitiesRpc = Rpc.make('Studio.QueryEntities', {
  payload: QueryEntitiesPayloadSchema,
  success: Schema.Struct({
    items: Schema.Array(EncodedEntitySchema),
    hasMore: Schema.Boolean,
  }),
  error: QueryEntitiesError,
});
