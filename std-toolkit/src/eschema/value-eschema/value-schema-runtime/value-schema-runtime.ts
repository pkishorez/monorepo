import { Effect, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  ValueEnvelopeEncoded,
  ValueEvolution,
  ValueSchema,
  ValueSchemaDecoded,
} from '../../domain/schema-model/index.js';
import {
  metaSchema,
  schemaDescriptor,
} from '../../domain/schema-model/index.js';
import { ESchemaError } from '../../domain/eschema-error/index.js';
import { registerESchemaIntrospection } from '../../domain/introspection/index.js';

function hasVersionStamp(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && '_v' in value;
}

export function makeValueSchemaRuntime<
  TVersion extends string,
  TLatest extends ValueSchema,
>(input: {
  readonly owner: object;
  readonly name: string;
  readonly latestVersion: TVersion;
  readonly evolutions: readonly ValueEvolution[];
}) {
  const evolutions = [...input.evolutions];
  registerESchemaIntrospection(input.owner, () => ({
    name: input.name,
    kind: 'value',
    idField: null,
    evolutions: evolutions.map(({ version, schema }) => ({ version, schema })),
  }));

  const schema = (): TLatest => {
    const latest = evolutions.at(-1);
    if (latest?.schema === undefined) {
      throw new Error(
        'ValueESchema is not properly initialized. This usually happens when the schema is accessed before module initialization completes. Consider using lazy initialization or avoiding top-level schema computations.',
      );
    }
    return latest.schema as TLatest;
  };

  const decode = (
    value: unknown,
  ): Effect.Effect<ValueSchemaDecoded<TLatest>, ESchemaError> =>
    Effect.gen(function* () {
      const isEnvelope = hasVersionStamp(value);
      const version = isEnvelope
        ? yield* Schema.decodeUnknownEffect(metaSchema)(value).pipe(
            Effect.map((metadata) => metadata._v),
            Effect.mapError(
              (cause) => new ESchemaError({ message: 'Decode failed', cause }),
            ),
          )
        : (evolutions[0]?.version ?? input.latestVersion);
      const index = evolutions.findIndex(
        (evolution) => evolution.version === version,
      );
      const evolution = evolutions[index];
      if (index === -1 || evolution === undefined) {
        return yield* new ESchemaError({
          message: `Unknown schema version: ${version}`,
        });
      }
      const encoded = isEnvelope ? value.value : value;
      let data = yield* Schema.decodeUnknownEffect(evolution.schema)(
        encoded,
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
      return data as ValueSchemaDecoded<TLatest>;
    });

  const encode = (
    value: ValueSchemaDecoded<TLatest>,
  ): Effect.Effect<ValueEnvelopeEncoded<TVersion, TLatest>, ESchemaError> =>
    Effect.gen(function* () {
      if (evolutions.length === 0) {
        return yield* new ESchemaError({ message: 'No evolutions found' });
      }
      const encoded = yield* Schema.encodeEffect(schema())(value).pipe(
        Effect.mapError(
          (cause) => new ESchemaError({ message: 'Encode failed', cause }),
        ),
      );
      return {
        _v: input.latestVersion,
        value: encoded,
      } as ValueEnvelopeEncoded<TVersion, TLatest>;
    });

  return {
    schema,
    decode,
    encode,
    descriptor: (): ESchemaDescriptor =>
      schemaDescriptor(
        Schema.Struct({
          _v: Schema.Literal(input.latestVersion),
          value: schema(),
        }),
      ),
  } as const;
}
