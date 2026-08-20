import { Effect, Schema } from 'effect';
import { ESchemaError } from '../../eschema/index.js';

export const entityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
  _s: Schema.optional(Schema.Number),
  _c: Schema.optional(Schema.Number),
});

export const singleEntityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _u: Schema.String,
});

export type EntityMeta = typeof entityMetaSchema.Type;
export type SingleEntityMeta = typeof singleEntityMetaSchema.Type;

const invalidMeta = (cause: unknown) =>
  new ESchemaError({ message: 'Invalid Entity Meta', cause });

const rejectVersion = (input: unknown) =>
  input !== null && typeof input === 'object' && Object.hasOwn(input, '_v')
    ? Effect.fail(
        new ESchemaError({
          message: 'Decoded Entity Meta must not contain _v',
        }),
      )
    : Effect.void;

export const decodeEntityMeta = (input: unknown) =>
  rejectVersion(input).pipe(
    Effect.andThen(Schema.decodeUnknownEffect(entityMetaSchema)(input)),
    Effect.mapError((cause) =>
      cause instanceof ESchemaError ? cause : invalidMeta(cause),
    ),
  );

export const decodeSingleEntityMeta = (input: unknown) =>
  rejectVersion(input).pipe(
    Effect.andThen(Schema.decodeUnknownEffect(singleEntityMetaSchema)(input)),
    Effect.mapError((cause) =>
      cause instanceof ESchemaError ? cause : invalidMeta(cause),
    ),
  );
