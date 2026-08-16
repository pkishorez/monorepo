import { Schema } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';

const entityMeta = (entityName: string) =>
  Schema.Struct({
    _v: Schema.String,
    _e: Schema.Literal(entityName),
    _d: Schema.Boolean,
    _u: Schema.String,
    _s: Schema.optional(Schema.Number),
    _c: Schema.optional(Schema.Number),
  });

export const makePeerMessageCodec = <TItem>(schema: AnyESchema) => {
  const envelope = Schema.Struct({
    version: Schema.Literal(1),
    entities: Schema.NonEmptyArray(
      Schema.Struct({
        value: schema.schema,
        meta: entityMeta(schema.name),
      }),
    ),
  });

  return {
    decode: (message: unknown) => Schema.decodeUnknownEffect(envelope)(message),
    encode: (entities: readonly [EntityType<TItem>, ...EntityType<TItem>[]]) =>
      Schema.encodeEffect(envelope)({
        version: 1,
        entities: entities as typeof envelope.Type.entities,
      }),
  };
};
