import { Effect, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  Evolution,
  Prettify,
  StructFieldsType,
  StructFieldsEncoded,
  StructFieldsSchema,
} from '../schema-model/index.js';
import { metaSchema, schemaDescriptor, struct } from '../schema-model/index.js';
import {
  ESchemaError,
  findOutdatedVersion,
  needsBackfill,
  type ReadError,
  UnrepresentableFieldError,
  unknownVersion,
} from '../eschema-error/index.js';
import { registerEncoded, registerGapSteps } from '../encoded/index.js';
import {
  refuseNestedGap,
  registerESchemaIntrospection,
  type ESchemaKind,
} from '../introspection/index.js';
import { findUndescribableField } from '../snapshot-type/index.js';
import { findNonPortableValue } from '../portable-value/index.js';

export function makeObjectSchemaRuntime<
  TVersion extends string,
  TLatest extends StructFieldsSchema,
>(input: {
  readonly owner: object;
  readonly name: string;
  readonly kind: Exclude<ESchemaKind, 'value'>;
  readonly idField: string | null;
  readonly latestVersion: TVersion;
  readonly evolutions: readonly Evolution[];
}) {
  const evolutions = [...input.evolutions];
  // A version after v1 with no migration is a gap version.
  const isGap = (index: number) =>
    index > 0 && evolutions[index]?.migration === null;
  for (const evolution of evolutions) {
    const ast = struct(evolution.schema).ast;
    const found = findUndescribableField(ast);
    if (found !== undefined) {
      throw new UnrepresentableFieldError(
        input.name,
        evolution.version,
        found.path,
        found.reason,
        found.detail,
      );
    }
    refuseNestedGap(input.name, evolution.version, ast);
  }
  registerESchemaIntrospection(input.owner, () => ({
    name: input.name,
    kind: input.kind,
    idField: input.idField,
    evolutions: evolutions.map(({ version, schema }, index) => ({
      version,
      schema: struct(schema),
      gap: isGap(index),
    })),
  }));

  const fields = (): TLatest => {
    const latest = evolutions.at(-1);
    if (latest?.schema === undefined) {
      throw new Error(
        'ESchema is not properly initialized. This usually happens when the schema is accessed before module initialization completes. Consider using lazy initialization or avoiding top-level schema computations.',
      );
    }
    return latest.schema as TLatest;
  };

  // The index of the first gap version after `index`, or past the latest.
  const nextGap = (index: number): number => {
    let next = index + 1;
    while (next < evolutions.length && !isGap(next)) next++;
    return next;
  };

  // Reads an encoded form with its own version's fields, before any migration.
  const readStored = (
    value: unknown,
  ): Effect.Effect<{ index: number; data: unknown }, ReadError> =>
    Effect.gen(function* () {
      const version = yield* Schema.decodeUnknownEffect(metaSchema)(value).pipe(
        Effect.map((metadata) => metadata._v),
        Effect.orElseSucceed(
          () => evolutions[0]?.version ?? input.latestVersion,
        ),
      );
      const index = evolutions.findIndex(
        (evolution) => evolution.version === version,
      );
      const evolution = evolutions[index];
      if (index === -1 || evolution === undefined) {
        return yield* unknownVersion(input.name, version, input.latestVersion);
      }
      const data = yield* Schema.decodeUnknownEffect(struct(evolution.schema))(
        value,
      ).pipe(
        Effect.mapError(
          (cause) =>
            findOutdatedVersion(cause) ??
            new ESchemaError({ message: 'Decode failed', cause }),
        ),
      );
      return { index, data };
    });

  // Runs the migrations after version `index`, up to `until` (exclusive).
  const migrate = (
    data: unknown,
    index: number,
    until: number,
  ): Effect.Effect<unknown, ESchemaError> =>
    Effect.gen(function* () {
      for (let next = index + 1; next < until; next++) {
        const migration = evolutions[next]?.migration;
        if (migration === undefined || migration === null) {
          return yield* new ESchemaError({ message: 'Migration not found' });
        }
        data = yield* Effect.try({
          try: () => migration(data),
          catch: (cause) =>
            new ESchemaError({
              message: `Migration to ${evolutions[next]!.version} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              cause,
            }),
        });
      }
      return data;
    });

  const decode = (
    value: unknown,
  ): Effect.Effect<Prettify<StructFieldsType<TLatest>>, ReadError> =>
    Effect.gen(function* () {
      const { index, data } = yield* readStored(value);
      const gap = nextGap(index);
      if (gap < evolutions.length) {
        return yield* needsBackfill(
          input.name,
          evolutions[index]!.version,
          evolutions[gap]!.version,
        );
      }
      return (yield* migrate(data, index, gap)) as Prettify<
        StructFieldsType<TLatest>
      >;
    });

  // The value the migrations reached, checked against that version's fields
  // as a full read checks the latest, so a migration cannot pass off a value
  // its version would refuse.
  const reached = (until: number, value: unknown) => {
    const { version, schema } = evolutions[until - 1]!;
    return Schema.decodeUnknownEffect(Schema.toType(struct(schema)))(
      value,
    ).pipe(
      Effect.map((checked) => ({ version, value: checked })),
      Effect.mapError(
        (cause) =>
          new ESchemaError({
            message: `Migration to ${version} produced a value ${version} refuses`,
            data: value,
            cause,
          }),
      ),
    );
  };

  registerGapSteps(input.owner, {
    readToGap: (value) =>
      Effect.gen(function* () {
        const { index, data } = yield* readStored(value);
        const until = nextGap(index);
        return yield* reached(until, yield* migrate(data, index, until));
      }),
    migrateToGap: (version, value) =>
      Effect.gen(function* () {
        const index = evolutions.findIndex(
          (evolution) => evolution.version === version,
        );
        const evolution = evolutions[index];
        if (evolution === undefined) {
          return yield* new ESchemaError({
            message: `Unknown schema version: ${version}`,
          });
        }
        const data = yield* Schema.decodeUnknownEffect(
          Schema.toType(struct(evolution.schema)),
        )(value).pipe(
          Effect.mapError(
            (cause) =>
              new ESchemaError({
                message: `Not a ${input.name} ${version} value`,
                data: value,
                cause,
              }),
          ),
        );
        const until = nextGap(index);
        return yield* reached(until, yield* migrate(data, index, until));
      }),
  });

  const encode = (
    value: StructFieldsType<TLatest>,
  ): Effect.Effect<
    Prettify<StructFieldsEncoded<TLatest>> & { readonly _v: TVersion },
    ESchemaError
  > =>
    Effect.gen(function* () {
      if (evolutions.at(-1) === undefined) {
        return yield* new ESchemaError({ message: 'No evolutions found' });
      }
      const data = yield* Schema.encodeEffect(struct(fields()))(value).pipe(
        Effect.mapError(
          (cause) => new ESchemaError({ message: 'Encode failed', cause }),
        ),
      );
      const nonPortable = findNonPortableValue(data);
      if (nonPortable !== undefined) {
        return yield* new ESchemaError({
          message: `Encode failed: ${input.name} field "${nonPortable.path}": ${nonPortable.detail}`,
          data: value,
        });
      }
      return {
        ...data,
        _v: input.latestVersion,
      } as Prettify<StructFieldsEncoded<TLatest>> & {
        readonly _v: TVersion;
      };
    });

  registerEncoded(input.owner, { read: decode, write: encode });

  return {
    fields,
    descriptor: (): ESchemaDescriptor =>
      schemaDescriptor(
        Schema.Struct({
          ...fields(),
          _v: Schema.Literal(input.latestVersion),
        }),
      ),
  } as const;
}
