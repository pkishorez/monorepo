import { Schema } from 'effect';
import { Address, Blueprint } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';

type Encode = (value: unknown) => unknown;

const encoders = new WeakMap<Schema.Top, Encode>();

const encoderOf = (schema: Schema.Top | undefined): Encode => {
  if (!schema) return (value) => value;
  const kept = encoders.get(schema);
  if (kept) return kept;
  const encode = Schema.encodeUnknownSync(
    schema as Schema.Codec<unknown, unknown>,
  );
  encoders.set(schema, encode);
  return encode;
};

export const encoded = (schema: Schema.Top | undefined, value: unknown) => {
  try {
    return encoderOf(schema)(value);
  } catch {
    return value;
  }
};

export const blueprintAt = (
  root: Blueprint,
  address: string,
): Blueprint | undefined =>
  Blueprint.at(root, Address.place(address as Address));

export const encodedData = (
  instance: Instance,
  print: Blueprint | undefined,
) => ({
  state: encoded(print?.state[instance.state._tag]?.data, instance.state),
  model: encoded(print?.schemas.model, instance.model),
  ...('props' in instance
    ? { props: encoded(print?.schemas.props, instance.props) }
    : {}),
});

export const keyOf = (address: string): string | undefined =>
  Address.parse(address as Address).path.at(-1)?.key;
