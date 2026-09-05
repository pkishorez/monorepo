import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  ESchemaError,
  type AnyESchema,
  type AnyUnkeyedESchema,
} from '../../eschema/index.js';
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

export type DecodedEntity<T> = {
  readonly value: T;
  readonly meta: EntityMeta;
};

export type EncodedEntity<T> = {
  readonly value: T;
  readonly meta: EntityMeta;
};

export type DecodedSingleEntity<T> = {
  readonly value: T;
  readonly meta: SingleEntityMeta;
};

export type EncodedSingleEntity<T> = {
  readonly value: T;
  readonly meta: SingleEntityMeta;
};

type EntitySchemaCodec<S extends AnyESchema> = Schema.Codec<
  DecodedEntity<S['Type']>,
  EncodedEntity<S['Encoded']>
> & {
  readonly latestVersion: S['latestVersion'];
  readonly decode: (
    input: unknown,
  ) => Effect.Effect<DecodedEntity<S['Type']>, ESchemaError>;
  readonly encode: (
    input: DecodedEntity<S['Type']>,
  ) => Effect.Effect<EncodedEntity<S['Encoded']>, ESchemaError>;
};

type SingleEntitySchemaCodec<S extends AnyUnkeyedESchema> = Schema.Codec<
  DecodedSingleEntity<S['Type']>,
  EncodedSingleEntity<S['Encoded']>
> & {
  readonly latestVersion: S['latestVersion'];
  readonly decode: (
    input: unknown,
  ) => Effect.Effect<DecodedSingleEntity<S['Type']>, ESchemaError>;
  readonly encode: (
    input: DecodedSingleEntity<S['Type']>,
  ) => Effect.Effect<EncodedSingleEntity<S['Encoded']>, ESchemaError>;
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

const requireEncodedVersion = (value: unknown) => {
  if (
    value === null ||
    typeof value !== 'object' ||
    !Object.hasOwn(value, '_v') ||
    typeof (value as { readonly _v?: unknown })._v !== 'string'
  ) {
    return Effect.fail(
      new ESchemaError({ message: 'Encoded entity value must contain _v' }),
    );
  }
  return Effect.succeed(value);
};

const requireEntityName = (expected: string, received: string) =>
  expected === received
    ? Effect.void
    : Effect.fail(
        new ESchemaError({
          message: `Wrong entity type: expected "${expected}", received "${received}"`,
        }),
      );

const schemaIssue = (input: unknown) => (cause: ESchemaError) =>
  new SchemaIssue.InvalidValue({ message: cause.message }, input);

export const EntitySchema = <S extends AnyESchema>(
  eschema: S,
): EntitySchemaCodec<S> => {
  const decode = (
    input: unknown,
  ): Effect.Effect<DecodedEntity<S['Type']>, ESchemaError> =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      const meta = yield* decodeEntityMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      yield* requireEncodedVersion(entity.value);
      const value = yield* eschema.decode(entity.value);
      return { value, meta };
    });

  const encode = (
    input: DecodedEntity<S['Type']>,
  ): Effect.Effect<EncodedEntity<S['Encoded']>, ESchemaError> =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      const meta = yield* decodeEntityMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      const value = yield* eschema.encode(entity.value as S['Type']);
      return { value, meta };
    });

  const encodedShell = Schema.Struct({
    value: Schema.Unknown,
    meta: EntityMetaSchema,
  });
  const decodedShell = Schema.Struct({
    value: Schema.toType(eschema.schema),
    meta: EntityMetaSchema,
  });
  const codec = encodedShell.pipe(
    Schema.decodeTo(
      decodedShell,
      SchemaTransformation.transformOrFail({
        decode: (input) =>
          decode(input).pipe(Effect.mapError(schemaIssue(input))),
        encode: (input) =>
          encode(input).pipe(Effect.mapError(schemaIssue(input))),
      }),
    ),
  ) as Schema.Codec<DecodedEntity<S['Type']>, EncodedEntity<S['Encoded']>>;

  return Object.assign(codec, {
    latestVersion: eschema.latestVersion,
    decode,
    encode,
  });
};

export const SingleEntitySchema = <S extends AnyUnkeyedESchema>(
  eschema: S,
): SingleEntitySchemaCodec<S> => {
  const decode = (
    input: unknown,
  ): Effect.Effect<DecodedSingleEntity<S['Type']>, ESchemaError> =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      const meta = yield* decodeSingleEntityMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      yield* requireEncodedVersion(entity.value);
      const value = yield* eschema.decode(entity.value);
      return { value, meta };
    });

  const encode = (
    input: DecodedSingleEntity<S['Type']>,
  ): Effect.Effect<EncodedSingleEntity<S['Encoded']>, ESchemaError> =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      const meta = yield* decodeSingleEntityMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      const value = yield* eschema.encode(entity.value as S['Type']);
      return { value, meta };
    });

  const encodedShell = Schema.Struct({
    value: Schema.Unknown,
    meta: SingleEntityMetaSchema,
  });
  const decodedShell = Schema.Struct({
    value: Schema.toType(eschema.schema),
    meta: SingleEntityMetaSchema,
  });
  const codec = encodedShell.pipe(
    Schema.decodeTo(
      decodedShell,
      SchemaTransformation.transformOrFail({
        decode: (input) =>
          decode(input).pipe(Effect.mapError(schemaIssue(input))),
        encode: (input) =>
          encode(input).pipe(Effect.mapError(schemaIssue(input))),
      }),
    ),
  ) as Schema.Codec<
    DecodedSingleEntity<S['Type']>,
    EncodedSingleEntity<S['Encoded']>
  >;

  return Object.assign(codec, {
    latestVersion: eschema.latestVersion,
    decode,
    encode,
  });
};
