import { Schema } from 'effect';

export const EntityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
});

export const SingleEntityMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
});

export type EntityMeta = typeof EntityMetaSchema.Type;
export type SingleEntityMeta = typeof SingleEntityMetaSchema.Type;

export type Entity<T> = {
  readonly value: T;
  readonly meta: EntityMeta;
};

export type SingletonEntity<T> = {
  readonly value: T;
  readonly meta: SingleEntityMeta;
};
