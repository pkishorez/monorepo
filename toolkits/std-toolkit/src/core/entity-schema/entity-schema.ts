import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  ESchemaError,
  type AnyESchema,
  type AnyUnkeyedESchema,
  type OutdatedVersion,
} from '../../eschema/index.js';
import {
  readEncoded,
  writeEncoded,
} from '../../eschema/domain/encoded/index.js';
import {
  findOutdatedVersion,
  unknownVersion,
} from '../../eschema/domain/eschema-error/index.js';
import {
  decodeEntityMeta,
  decodeSingleEntityMeta,
  entityMetaSchema,
  singleEntityMetaSchema,
  type EntityMeta,
  type SingleEntityMeta,
} from './entity-meta.js';

export const EntityMetaSchema = entityMetaSchema;
export const SingleEntityMetaSchema = singleEntityMetaSchema;
export type { EntityMeta, SingleEntityMeta };

export type Entity<T> = {
  readonly value: T;
  readonly meta: EntityMeta;
};

export type SingletonEntity<T> = {
  readonly value: T;
  readonly meta: SingleEntityMeta;
};

type Unversioned<T> = Omit<T, '_v'>;

type EntityCodec<S extends AnyESchema, M> = Schema.Codec<
  { readonly value: S['Type']; readonly meta: M },
  { readonly value: Unversioned<S['Encoded']>; readonly meta: M }
> & {
  readonly latestVersion: S['latestVersion'];
  readonly decode: (
    input: unknown,
  ) => Effect.Effect<
    { readonly value: S['Type']; readonly meta: M },
    ESchemaError | OutdatedVersion
  >;
  readonly encode: (input: {
    readonly value: S['Type'];
    readonly meta: M;
  }) => Effect.Effect<
    { readonly value: Unversioned<S['Encoded']>; readonly meta: M },
    ESchemaError | OutdatedVersion
  >;
};

const entityInput = (input: unknown) => {
  if (input === null || typeof input !== 'object') {
    return Effect.fail(
      new ESchemaError({ message: 'Entity must contain value and meta' }),
    );
  }
  const entity = input as { readonly value?: unknown; readonly meta?: unknown };
  if (!Object.hasOwn(entity, 'value') || !Object.hasOwn(entity, 'meta')) {
    return Effect.fail(
      new ESchemaError({ message: 'Entity must contain value and meta' }),
    );
  }
  return Effect.succeed(
    entity as { readonly value: unknown; readonly meta: unknown },
  );
};

const requireObject = (value: unknown) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Effect.succeed(value)
    : Effect.fail(
        new ESchemaError({ message: 'Entity value must be an object' }),
      );

const requireEntityName = (expected: string, received: string) =>
  expected === received
    ? Effect.void
    : Effect.fail(
        new ESchemaError({
          message: `Wrong entity type: expected "${expected}", received "${received}"`,
        }),
      );

// A value in memory is always at the latest version, so encoding requires its
// `_v` to say so, exactly as the codec's own meta schema does.
const requireLatest = (eschema: AnyESchema, version: unknown) =>
  version === eschema.latestVersion
    ? Effect.void
    : Effect.fail(
        typeof version === 'string'
          ? unknownVersion(eschema.name, version, eschema.latestVersion)
          : new ESchemaError({ message: 'Entity Meta must contain _v' }),
      );

const schemaIssue =
  (input: unknown) => (cause: ESchemaError | OutdatedVersion) =>
    new SchemaIssue.InvalidValue(
      cause._tag === 'OutdatedVersion'
        ? { message: cause.message, outdatedVersion: cause }
        : { message: cause.message },
      input,
    );

const makeEntityCodec = <
  S extends AnyESchema,
  M extends { readonly _e: string; readonly _v: string },
>(
  eschema: S,
  metaSchema: Schema.Codec<M>,
  decodeMeta: (input: unknown) => Effect.Effect<M, ESchemaError>,
): EntityCodec<S, M> => {
  const decode = (input: unknown) =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      const meta = yield* decodeMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      const encoded = yield* requireObject(entity.value);
      const value = yield* readEncoded(eschema, {
        ...encoded,
        _v: meta._v,
      });
      return { value, meta: { ...meta, _v: eschema.latestVersion } };
    });

  const encode = (input: { readonly value: S['Type']; readonly meta: M }) =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      yield* requireLatest(eschema, input.meta._v);
      const meta = yield* decodeMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      const { _v, ...value } = (yield* writeEncoded(
        eschema,
        entity.value as S['Type'],
      )) as S['Encoded'];
      return { value: value as Unversioned<S['Encoded']>, meta };
    });

  const codec = Schema.Struct({ value: Schema.Unknown, meta: metaSchema }).pipe(
    Schema.decodeTo(
      Schema.Struct({ value: Schema.toType(eschema.schema), meta: metaSchema }),
      SchemaTransformation.transformOrFail({
        decode: (input) =>
          decode(input).pipe(Effect.mapError(schemaIssue(input))),
        encode: (input) =>
          encode(input as never).pipe(Effect.mapError(schemaIssue(input))),
      }),
    ),
  ) as unknown as Schema.Codec<
    { readonly value: S['Type']; readonly meta: M },
    { readonly value: Unversioned<S['Encoded']>; readonly meta: M }
  >;

  return Object.assign(codec, {
    latestVersion: eschema.latestVersion,
    decode,
    encode,
  });
};

export const EntitySchema = <S extends AnyESchema>(eschema: S) =>
  makeEntityCodec<S, EntityMeta>(eschema, entityMetaSchema, decodeEntityMeta);

export const SingleEntitySchema = <S extends AnyUnkeyedESchema>(eschema: S) =>
  makeEntityCodec<S, SingleEntityMeta>(
    eschema,
    singleEntityMetaSchema,
    decodeSingleEntityMeta,
  );

export { findOutdatedVersion };
