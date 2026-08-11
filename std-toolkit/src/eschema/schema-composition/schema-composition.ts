import { Effect, Option, Schema, SchemaGetter, SchemaIssue } from 'effect';
import type {
  AnyESchema,
  AnyValueESchema,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
  ValueSchema,
  ValueSchemaDecoded,
  ValueSchemaEncoded,
} from '../domain/schema-model/index.js';
import { ESchemaError } from '../domain/eschema-error/index.js';
import {
  inspectESchema,
  registerESchemaComposition,
} from '../domain/introspection/index.js';

const compositionSchemas = new WeakMap<object, Schema.Top>();

export function toSchema<V extends string, L extends StructFieldsSchema>(
  eschema: AnyESchema<V, L>,
): Schema.Codec<
  StructFieldsDecoded<L>,
  StructFieldsEncoded<L> & { readonly _v: string }
>;
export function toSchema<V extends string, L extends ValueSchema>(
  eschema: AnyValueESchema<V, L>,
): Schema.Codec<
  ValueSchemaDecoded<L>,
  { readonly _v: string; readonly value: ValueSchemaEncoded<L> }
>;
export function toSchema(eschema: AnyESchema | AnyValueESchema): Schema.Top {
  const cached = compositionSchemas.get(eschema);
  if (cached !== undefined) return cached;

  const introspection = inspectESchema(eschema);
  const isValue = introspection.kind === 'value';
  const identifier = isValue
    ? `ValueESchema_${eschema.name}`
    : `ESchema_${eschema.name}`;
  const encodedSchema = eschema.schema.annotate({ identifier });
  const toIssue = (input: unknown, error: ESchemaError) =>
    new SchemaIssue.InvalidValue(Option.some(input), {
      message: error.message,
    });
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
