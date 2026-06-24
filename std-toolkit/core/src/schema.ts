import { Schema } from 'effect';
import type { AnyESchema, AnySingleEntityESchema } from '@std-toolkit/eschema';

export const MetaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
  _s: Schema.optional(Schema.Number),
  _c: Schema.optional(Schema.Number),
});

const SingleEntityMetaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
  _u: Schema.String,
});

export type EntityType<T> = {
  value: T;
  meta: typeof MetaSchema.Type;
};

export type SingleEntityType<T> = {
  value: T;
  meta: typeof SingleEntityMetaSchema.Type;
};

export const EntitySchema = <S extends AnyESchema>(eschema: S) =>
  Schema.Struct({
    value: eschema.schema as unknown as Schema.Codec<S['Type'], S['Type']>,
    meta: MetaSchema,
  });

export const SingleEntitySchema = <S extends AnySingleEntityESchema>(
  eschema: S,
) =>
  Schema.Struct({
    value: eschema.schema as unknown as Schema.Codec<S['Type'], S['Type']>,
    meta: SingleEntityMetaSchema,
  });
