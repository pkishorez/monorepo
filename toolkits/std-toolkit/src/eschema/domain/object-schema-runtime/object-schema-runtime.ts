import { Effect, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  Evolution,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from '../schema-model/index.js';
import { metaSchema, schemaDescriptor, struct } from '../schema-model/index.js';
import {
  ESchemaError,
  UnrepresentableFieldError,
} from '../eschema-error/index.js';
import {
  findUnrepresentableField,
  registerESchemaIntrospection,
  type ESchemaKind,
} from '../introspection/index.js';

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
  for (const evolution of evolutions) {
    const found = findUnrepresentableField(struct(evolution.schema).ast);
    if (found !== undefined) {
      throw new UnrepresentableFieldError(
        input.name,
        evolution.version,
        found.path,
        found.reason,
      );
    }
  }
  registerESchemaIntrospection(input.owner, () => ({
    name: input.name,
    kind: input.kind,
    idField: input.idField,
    evolutions: evolutions.map(({ version, schema }) => ({
      version,
      schema: struct(schema),
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

  const decode = (
    value: unknown,
  ): Effect.Effect<Prettify<StructFieldsDecoded<TLatest>>, ESchemaError> =>
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
        return yield* new ESchemaError({
          message: `Unknown schema version: ${version}`,
        });
      }

      let data = yield* Schema.decodeUnknownEffect(struct(evolution.schema))(
        value,
      ).pipe(
        Effect.mapError(
          (cause) => new ESchemaError({ message: 'Decode failed', cause }),
        ),
      );
      for (let next = index + 1; next < evolutions.length; next++) {
        const migration = evolutions[next];
        if (migration === undefined) {
          return yield* new ESchemaError({ message: 'Migration not found' });
        }
        data = migration.migration!(data);
      }
      return data as Prettify<StructFieldsDecoded<TLatest>>;
    });

  const encode = (
    value: StructFieldsDecoded<TLatest>,
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
      return {
        ...data,
        _v: input.latestVersion,
      } as Prettify<StructFieldsEncoded<TLatest>> & {
        readonly _v: TVersion;
      };
    });

  return {
    fields,
    decode,
    encode,
    descriptor: (): ESchemaDescriptor =>
      schemaDescriptor(
        Schema.Struct({
          ...fields(),
          _v: Schema.Literal(input.latestVersion),
        }),
      ),
  } as const;
}
