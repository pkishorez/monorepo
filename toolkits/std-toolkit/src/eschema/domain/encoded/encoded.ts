import type { Effect } from 'effect';
import type { ESchemaError, OutdatedVersion } from '../eschema-error/index.js';
import type { AnyEvolvingSchema } from '../schema-model/index.js';

interface EncodedCodec {
  readonly read: (
    value: unknown,
  ) => Effect.Effect<unknown, ESchemaError | OutdatedVersion>;
  readonly write: (value: never) => Effect.Effect<unknown, ESchemaError>;
}

const codecs = new WeakMap<object, EncodedCodec>();

export const registerEncoded = (eschema: object, codec: EncodedCodec): void => {
  codecs.set(eschema, codec);
};

const codecOf = (eschema: object): EncodedCodec => {
  const codec = codecs.get(eschema);
  if (codec === undefined) throw new TypeError('Not an ESchema');
  return codec;
};

export const readEncoded = <S extends AnyEvolvingSchema>(
  eschema: S,
  value: unknown,
) =>
  codecOf(eschema).read(value) as Effect.Effect<
    S['Type'],
    ESchemaError | OutdatedVersion
  >;

export const writeEncoded = <S extends AnyEvolvingSchema>(
  eschema: S,
  value: S['Type'],
) =>
  codecOf(eschema).write(value as never) as Effect.Effect<
    S['Encoded'],
    ESchemaError
  >;
