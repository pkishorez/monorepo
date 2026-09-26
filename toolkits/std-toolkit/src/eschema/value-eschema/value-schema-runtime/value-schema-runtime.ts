import { Effect, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  ValueEnvelopeEncoded,
  ValueEvolution,
  ValueSchema,
  ValueSchemaType,
} from '../../domain/schema-model/index.js';
import { schemaDescriptor } from '../../domain/schema-model/index.js';
import {
  ESchemaError,
  findOutdatedVersion,
  type OutdatedVersion,
  UnrepresentableFieldError,
  unknownVersion,
} from '../../domain/eschema-error/index.js';
import { registerEncoded } from '../../domain/encoded/index.js';
import {
  findUnrepresentableField,
  registerESchemaIntrospection,
} from '../../domain/introspection/index.js';

const EnvelopeSchema = Schema.Struct({
  _v: Schema.String,
  _value: Schema.Unknown,
});

const isEnvelope = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  '_value' in value;

const readEnvelope = (value: Record<string, unknown>) => {
  const unexpected = Object.keys(value).filter(
    (key) => key !== '_v' && key !== '_value',
  );
  if (unexpected.length > 0) {
    return Effect.fail(
      new ESchemaError({
        message: `Malformed value envelope: unexpected keys ${unexpected.join(', ')}`,
        data: value,
      }),
    );
  }
  return Schema.decodeUnknownEffect(EnvelopeSchema)(value).pipe(
    Effect.mapError(
      (cause) =>
        new ESchemaError({
          message: 'Malformed value envelope',
          data: value,
          cause,
        }),
    ),
  );
};

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
  for (const evolution of evolutions) {
    const found = findUnrepresentableField(evolution.schema.ast);
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
  ): Effect.Effect<ValueSchemaType<TLatest>, ESchemaError | OutdatedVersion> =>
    Effect.gen(function* () {
      const envelope = isEnvelope(value)
        ? yield* readEnvelope(value)
        : undefined;
      const version =
        envelope?._v ?? evolutions[0]?.version ?? input.latestVersion;
      const index = evolutions.findIndex(
        (evolution) => evolution.version === version,
      );
      const evolution = evolutions[index];
      if (index === -1 || evolution === undefined) {
        return yield* unknownVersion(input.name, version, input.latestVersion);
      }
      const encoded = envelope === undefined ? value : envelope._value;
      let data = yield* Schema.decodeUnknownEffect(evolution.schema)(
        encoded,
      ).pipe(
        Effect.mapError(
          (cause) =>
            findOutdatedVersion(cause) ??
            new ESchemaError({ message: 'Decode failed', cause }),
        ),
      );
      for (let next = index + 1; next < evolutions.length; next++) {
        const migration = evolutions[next];
        if (migration === undefined) {
          return yield* new ESchemaError({ message: 'Migration not found' });
        }
        data = yield* Effect.try({
          try: () => migration.migration!(data),
          catch: (cause) =>
            new ESchemaError({
              message: `Migration to ${migration.version} failed`,
              cause,
            }),
        });
      }
      return data as ValueSchemaType<TLatest>;
    });

  const encode = (
    value: ValueSchemaType<TLatest>,
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
        _value: encoded,
      } as ValueEnvelopeEncoded<TVersion, TLatest>;
    });

  registerEncoded(input.owner, { read: decode, write: encode });

  return {
    schema,
    descriptor: (): ESchemaDescriptor =>
      schemaDescriptor(
        Schema.Struct({
          _v: Schema.Literal(input.latestVersion),
          _value: schema(),
        }),
      ),
  } as const;
}
