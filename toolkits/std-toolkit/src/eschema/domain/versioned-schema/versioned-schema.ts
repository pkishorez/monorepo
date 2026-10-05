import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';
import type { AnyESchema, AnyValueESchema } from '../schema-model/index.js';
import {
  type ESchemaIntrospection,
  inspectESchema,
  latestSchema,
  registerESchemaComposition,
} from '../introspection/index.js';
import { readEncoded, writeEncoded } from '../encoded/index.js';
import type { ESchemaError, OutdatedVersion } from '../eschema-error/index.js';

const compositionSchemas = new WeakMap<object, Schema.Top>();

/**
 * What an ESchema's value looks like encoded, as JSON or any other codec
 * carries it: the latest version, with its `_v`. An older or unversioned value
 * is refused, never guessed at; only stored values are migrated.
 */
function wireSchema({ kind, evolutions }: ESchemaIntrospection): Schema.Top {
  const { version, schema } = evolutions.at(-1)!;
  const _v = Schema.Literal(version);
  return kind === 'value'
    ? Schema.Struct({ _v, _value: Schema.toEncoded(schema) })
    : Schema.toEncoded(
        Schema.Struct({
          ...(schema as Schema.Struct<Schema.Struct.Fields>).fields,
          _v,
        }),
      );
}

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
  const wire = wireSchema(introspection).annotate({ identifier });
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
        Schema.link<unknown>()(wire, {
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
        decode: SchemaGetter.transformEffect((input: unknown) =>
          readEncoded(eschema, input).pipe(
            Effect.mapError((error) => toIssue(input, error)),
          ),
        ),
        encode: SchemaGetter.transformEffect((input: unknown) =>
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
