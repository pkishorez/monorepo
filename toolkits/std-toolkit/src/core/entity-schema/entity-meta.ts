import { Effect, Schema } from 'effect';
import { ESchemaError } from '../../eschema/index.js';

export const entityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
  _s: Schema.optional(Schema.Number),
  _c: Schema.optional(Schema.Number),
});

export const singleEntityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
});

export type EntityMeta = typeof entityMetaSchema.Type;
export type SingleEntityMeta = typeof singleEntityMetaSchema.Type;

const invalidMeta = (cause: unknown) =>
  new ESchemaError({ message: 'Invalid Entity Meta', cause });

export const decodeEntityMeta = (input: unknown) =>
  Schema.decodeUnknownEffect(entityMetaSchema)(input).pipe(
    Effect.mapError(invalidMeta),
  );

export const decodeSingleEntityMeta = (input: unknown) =>
  Schema.decodeUnknownEffect(singleEntityMetaSchema)(input).pipe(
    Effect.mapError(invalidMeta),
  );
