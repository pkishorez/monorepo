import { Schema } from 'effect';
import type { SqliteDBError } from 'std-toolkit/sqlite';

const BadRequestPayload = Schema.Struct({
  _tag: Schema.Literal('BadRequest'),
  operation: Schema.String,
  reason: Schema.String,
});

export class BadRequestError extends Schema.TaggedErrorClass<BadRequestError>()(
  'BadRequestError',
  { error: BadRequestPayload },
  { httpApiStatus: 400 },
) {
  static badRequest(operation: string, reason: string) {
    return new BadRequestError({
      error: { _tag: 'BadRequest', operation, reason },
    });
  }
}

const UnsupportedMediaPayload = Schema.Struct({
  _tag: Schema.Literal('UnsupportedMediaType'),
  contentType: Schema.optional(Schema.String),
});

export class UnsupportedMediaTypeError extends Schema.TaggedErrorClass<UnsupportedMediaTypeError>()(
  'UnsupportedMediaTypeError',
  { error: UnsupportedMediaPayload },
  { httpApiStatus: 415 },
) {
  static unsupported(contentType?: string) {
    return new UnsupportedMediaTypeError({
      error: {
        _tag: 'UnsupportedMediaType',
        ...(contentType !== undefined && { contentType }),
      },
    });
  }
}

const InternalPayload = Schema.Struct({
  _tag: Schema.Literal('InternalError'),
  operation: Schema.String,
  cause: Schema.optional(Schema.String),
});

export class InternalError extends Schema.TaggedErrorClass<InternalError>()(
  'InternalError',
  { error: InternalPayload },
  { httpApiStatus: 500 },
) {
  static internal(operation: string, cause?: string) {
    return new InternalError({
      error: {
        _tag: 'InternalError',
        operation,
        ...(cause !== undefined && { cause }),
      },
    });
  }

  static fromSqlite(operation: string) {
    return (error: SqliteDBError) =>
      InternalError.internal(operation, String(error.error._tag));
  }
}
