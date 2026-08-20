import { Effect, Schema } from 'effect';
import { EntitySchema, type DecodedEntity } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import { ESchemaError } from '../../../eschema/index.js';

const peerMessageEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  entities: Schema.NonEmptyArray(Schema.Unknown),
});

export const makePeerMessageCodec = <S extends AnyESchema>(schema: S) => {
  const entitySchema = EntitySchema(schema);

  return {
    decode: (message: unknown) =>
      Effect.gen(function* () {
        const envelope =
          yield* Schema.decodeUnknownEffect(peerMessageEnvelope)(message);
        const entities = yield* Effect.forEach(
          envelope.entities,
          entitySchema.decode,
        );
        return { version: envelope.version, entities };
      }),
    encode: (
      entities: readonly [
        DecodedEntity<S['Type']>,
        ...DecodedEntity<S['Type']>[],
      ],
    ) =>
      Effect.gen(function* () {
        if (entities.length === 0) {
          return yield* new ESchemaError({
            message: 'A peer message must contain at least one entity',
          });
        }
        const encoded = yield* Effect.forEach(entities, entitySchema.encode);
        return { version: 1 as const, entities: encoded };
      }),
  };
};
