import { Effect, Schema } from 'effect';
import {
  AnyESchema,
  ESchemaEncoded,
  ESchemaError,
  ESchemaType,
} from '@std-toolkit/eschema';

export const MetaSchema = Schema.Struct({
  _v: Schema.String,
  _e: Schema.String,
  _d: Schema.Boolean,
  _u: Schema.String,
});

export type RowMeta = typeof MetaSchema.Type;

/**
 * Wire / cache shape: `value` is the JSON-safe encoded form of an ESchema
 * (`ESchemaEncoded<S>`) plus the entity meta. Anything that crosses a
 * serialization boundary uses this shape.
 */
export type EntityType<T> = {
  value: T;
  meta: RowMeta;
};

/**
 * Server-side row returned by db entity services. Carries the encoded `value`
 * (ready to forward to wire / cache / broadcast at zero cost) plus a memoized
 * `decoded` Effect that yields the rich, decoded `ESchemaType<S>` on demand.
 */
export type EntityRow<S extends AnyESchema> = EntityType<ESchemaEncoded<S>> & {
  decoded: Effect.Effect<ESchemaType<S>, ESchemaError>;
};

/**
 * Builds an `EntityRow<S>` from an already-encoded value plus meta. The
 * `decoded` Effect is memoized via `Effect.cached` so consumers pay the
 * decode cost at most once per row.
 */
export const makeEntityRow = <S extends AnyESchema>(
  eschema: S,
  value: ESchemaEncoded<S>,
  meta: RowMeta,
): Effect.Effect<EntityRow<S>> =>
  Effect.gen(function* () {
    const decoded = yield* Effect.cached(
      eschema.decode(value) as Effect.Effect<ESchemaType<S>, ESchemaError>,
    );
    return { value, meta, decoded };
  });

export const BroadcastSchema = Schema.Struct({
  _tag: Schema.Literal('@std-toolkit/broadcast'),
  values: Schema.Array(
    Schema.Struct({ meta: MetaSchema, value: Schema.Unknown }),
  ),
});

/**
 * Wire schema for a single entity row over RPC. `value` is the **encoded**
 * shape of the eschema (`ESchemaEncoded<S>` — JSON-safe primitives + `_v`),
 * not the decoded `Type`. Consumers (e.g. `stdCollectionOptions`) decode
 * explicitly at the collection boundary.
 */
export const EntitySchema = <S extends AnyESchema>(eschema: S) =>
  Schema.Struct({
    value: Schema.encodedSchema(eschema.schema) as unknown as Schema.Schema<
      ESchemaEncoded<S>,
      ESchemaEncoded<S>
    >,
    meta: MetaSchema,
  });
