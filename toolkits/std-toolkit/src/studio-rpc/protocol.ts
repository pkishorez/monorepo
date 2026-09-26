import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';
import { EntityMetaSchema, SingleEntityMetaSchema } from '../core/index.js';
import { toSchema } from '../eschema/index.js';
import { TableSnapshotESchema } from '../snapshot/index.js';

// Key components are named by key path and hold a string or a number.
const StringRecordSchema = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Finite]),
);

// Studio clients have no application schemas, so entity values travel in
// their encoded (wire) form, untyped.
const RawValueSchema = Schema.Record(Schema.String, Schema.Unknown);

const RawEntitySchema = Schema.Struct({
  value: RawValueSchema,
  meta: EntityMetaSchema,
});

const RawSingleEntitySchema = Schema.Struct({
  value: RawValueSchema,
  meta: SingleEntityMetaSchema,
});

const StudioEntitySchema = Schema.Union([
  RawEntitySchema,
  RawSingleEntitySchema,
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
  after: Schema.optional(RawEntitySchema),
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

// The document travels stamped with its own `_v`, so a client on another
// toolkit release migrates it forward like any stored snapshot.
export const GetTableSnapshotRpc = Rpc.make('Studio.GetTableSnapshot', {
  success: toSchema(TableSnapshotESchema),
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
    items: Schema.Array(RawEntitySchema),
    hasMore: Schema.Boolean,
  }),
  error: QueryEntitiesError,
});
