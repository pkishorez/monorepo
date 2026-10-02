import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  EntityMetaSchema,
  SingleEntityMetaSchema,
  type EntityMeta,
  type SingleEntityMeta,
} from '../../../core/index.js';
import { readEncoded, writeEncoded } from '../encoded/index.js';
import {
  ESchemaError,
  type OutdatedVersion,
  unknownVersion,
} from '../eschema-error/index.js';
import { latestSchema } from '../introspection/index.js';
import type {
  AnyESchema,
  EntitySchemaOf,
  SingleEntitySchemaOf,
} from '../schema-model/index.js';

type VersionedMeta = { readonly _e: string; readonly _v: string };

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

const decodeMeta =
  <M extends VersionedMeta>(metaSchema: Schema.Codec<M>) =>
  (input: unknown) =>
    Schema.decodeUnknownEffect(metaSchema)(input).pipe(
      Effect.mapError(
        (cause) => new ESchemaError({ message: 'Invalid Entity Meta', cause }),
      ),
    );

const schemaIssue =
  (input: unknown) => (cause: ESchemaError | OutdatedVersion) =>
    new SchemaIssue.InvalidValue(
      cause._tag === 'OutdatedVersion'
        ? { message: cause.message, outdatedVersion: cause }
        : { message: cause.message },
      input,
    );

const makeEntityCodec = <M extends VersionedMeta>(
  eschema: AnyESchema,
  metaSchema: Schema.Codec<M>,
): Schema.Top => {
  type Codec = { readonly value: any; readonly meta: M };
  const readMeta = decodeMeta(metaSchema);

  const decode = (
    input: unknown,
  ): Effect.Effect<Codec, ESchemaError | OutdatedVersion> =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      const meta = yield* readMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      const encoded = yield* requireObject(entity.value);
      const value = yield* readEncoded(eschema, {
        ...encoded,
        _v: meta._v,
      });
      return { value, meta: { ...meta, _v: eschema.latestVersion } };
    });

  const encode = (
    input: Codec,
  ): Effect.Effect<Codec, ESchemaError | OutdatedVersion> =>
    Effect.gen(function* () {
      const entity = yield* entityInput(input);
      yield* requireLatest(eschema, input.meta._v);
      const meta = yield* readMeta(entity.meta);
      yield* requireEntityName(eschema.name, meta._e);
      const { _v, ...value } = (yield* writeEncoded(
        eschema,
        entity.value as never,
      )) as { readonly _v: string };
      return { value, meta };
    });

  return Schema.Struct({ value: Schema.Unknown, meta: metaSchema }).pipe(
    Schema.decodeTo(
      Schema.Struct({
        value: Schema.toType(latestSchema(eschema)),
        meta: metaSchema,
      }),
      SchemaTransformation.transformEffect({
        decode: (input) =>
          decode(input).pipe(Effect.mapError(schemaIssue(input))),
        encode: (input) =>
          encode(input).pipe(Effect.mapError(schemaIssue(input))),
      }),
    ),
  );
};

const entitySchemas = new WeakMap<object, Schema.Top>();
const singleEntitySchemas = new WeakMap<object, Schema.Top>();

const cached = (
  cache: WeakMap<object, Schema.Top>,
  eschema: AnyESchema,
  make: () => Schema.Top,
) => {
  const found = cache.get(eschema);
  if (found !== undefined) return found;
  const made = make();
  cache.set(eschema, made);
  return made;
};

// An ESchema's `entity`: a whole Entity with `_v` in Entity Meta.
export const entitySchema = <S extends AnyESchema>(eschema: S) =>
  cached(entitySchemas, eschema, () =>
    makeEntityCodec<EntityMeta>(eschema, EntityMetaSchema),
  ) as unknown as EntitySchemaOf<S['Type'], S['Encoded']>;

// An ESchema's `singleEntity`: a SingleEntity with its smaller meta.
export const singleEntitySchema = <S extends AnyESchema>(eschema: S) =>
  cached(singleEntitySchemas, eschema, () =>
    makeEntityCodec<SingleEntityMeta>(eschema, SingleEntityMetaSchema),
  ) as unknown as SingleEntitySchemaOf<S['Type'], S['Encoded']>;
