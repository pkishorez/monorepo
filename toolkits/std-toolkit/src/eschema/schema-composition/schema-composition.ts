import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';
import type {
  AnyESchema,
  AnyValueESchema,
} from '../domain/schema-model/index.js';
import { ESchemaError } from '../domain/eschema-error/index.js';
import {
  inspectESchema,
  registerESchemaComposition,
} from '../domain/introspection/index.js';

const compositionSchemas = new WeakMap<object, Schema.Top>();

export function toSchema<T extends AnyESchema>(
  eschema: T,
): Schema.Codec<T['Type'], T['Encoded']>;
export function toSchema<T extends AnyValueESchema>(
  eschema: T,
): Schema.Codec<T['Type'], T['Encoded']>;
export function toSchema(eschema: AnyESchema | AnyValueESchema): Schema.Top {
  const cached = compositionSchemas.get(eschema);
  if (cached !== undefined) return cached;

  const introspection = inspectESchema(eschema);
  const isValue = introspection.kind === 'value';
  const identifier = isValue
    ? `ValueESchema_${eschema.name}`
    : `ESchema_${eschema.name}`;
  // The encoded side is what persists: the nested value's fields plus its
  // version stamp (a value ESchema persists as its envelope). Decoding and
  // encoding pass straight through to the ESchema, so this shape is only
  // read by structural consumers such as capture and generated rows.
  const encodedSchema = (
    isValue
      ? Schema.Struct({
          _v: Schema.Literal(eschema.latestVersion),
          value: eschema.schema,
        })
      : Schema.Struct({
          ...(eschema as AnyESchema).fields,
          _v: Schema.Literal(eschema.latestVersion),
        })
  ).annotate({ identifier });
  const toIssue = (input: unknown, error: ESchemaError) =>
    new SchemaIssue.InvalidValue(
      {
        message: error.message,
      },
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
      // Generated values of a version that nests this ESchema must hold a
      // real persisted nested value, not an opaque declaration.
      toArbitrary: () => Schema.toArbitrary(Schema.toEncoded(encodedSchema)),
    },
  ).annotate({
    eschemaIdentity: eschema.name,
    eschemaReference: identifier,
  });
  const composed = surrogate
    .pipe(
      Schema.decodeTo(Schema.Unknown, {
        decode: SchemaGetter.transformOrFail((input: unknown) =>
          eschema
            .decode(input)
            .pipe(Effect.mapError((error) => toIssue(input, error))),
        ),
        encode: SchemaGetter.transformOrFail((input: unknown) =>
          eschema
            .encode(input as never)
            .pipe(Effect.mapError((error) => toIssue(input, error))),
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
