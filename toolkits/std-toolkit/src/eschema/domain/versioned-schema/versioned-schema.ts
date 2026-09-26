import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';
import type { AnyESchema, AnyValueESchema } from '../schema-model/index.js';
import {
  inspectESchema,
  latestSchema,
  registerESchemaComposition,
} from '../introspection/index.js';
import { readEncoded, writeEncoded } from '../encoded/index.js';
import type { ESchemaError, OutdatedVersion } from '../eschema-error/index.js';

const compositionSchemas = new WeakMap<object, Schema.Top>();

// An ESchema's `schema`: reads any known version and migrates it, writes the
// latest with `_v` inline.
export function versionedSchema<T extends AnyESchema | AnyValueESchema>(
  eschema: T,
): Schema.Codec<T['Type'], T['Encoded']>;
export function versionedSchema(
  eschema: AnyESchema | AnyValueESchema,
): Schema.Top {
  const cached = compositionSchemas.get(eschema);
  if (cached !== undefined) return cached;

  const introspection = inspectESchema(eschema);
  const isValue = introspection.kind === 'value';
  const identifier = isValue
    ? `ValueESchema_${eschema.name}`
    : `ESchema_${eschema.name}`;
  const latest = latestSchema(eschema);
  const encodedSchema = latest.annotate({ identifier });
  const toIssue = (input: unknown, error: ESchemaError | OutdatedVersion) =>
    new SchemaIssue.InvalidValue(
      error._tag === 'OutdatedVersion'
        ? { message: error.message, outdatedVersion: error }
        : { message: error.message },
      input,
    );
  const surrogate = Schema.declare<unknown>(
    (_input: unknown): _input is unknown => true,
    {
      toCodec: () =>
        Schema.link<unknown>()(encodedSchema, {
          decode: SchemaGetter.passthrough({ strict: false }),
          encode: SchemaGetter.passthrough({ strict: false }),
        }),
    },
  ).annotate({
    eschemaIdentity: eschema.name,
    eschemaReference: identifier,
  });
  const composed = surrogate
    .pipe(
      Schema.decodeTo(Schema.toType(latest), {
        decode: SchemaGetter.transformOrFail((input: unknown) =>
          readEncoded(eschema, input).pipe(
            Effect.mapError((error) => toIssue(input, error)),
          ),
        ),
        encode: SchemaGetter.transformOrFail((input: unknown) =>
          writeEncoded(eschema, input as never).pipe(
            Effect.mapError((error) => toIssue(input, error)),
          ),
        ),
      }),
    )
    .annotate({ identifier });
  const link = composed.ast.encoding?.[0];
  if (link !== undefined && link.transformation._tag === 'Transformation') {
    registerESchemaComposition(composed.ast, link.to, link.transformation, {
      eschema,
      identity: eschema.name,
    });
  }
  compositionSchemas.set(eschema, composed);
  return composed;
}
