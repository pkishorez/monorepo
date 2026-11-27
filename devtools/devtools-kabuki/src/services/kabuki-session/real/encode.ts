import { Schema } from 'effect';
import { Address, Blueprint } from '@kestack/kabuki';
import type {
  BeforeAfter,
  Change,
  Instance,
  Whole,
} from '@kestack/kabuki/types';
import { trimmed } from '../../../server/rpc/contract/index.ts';
import type {
  BeforeAfter as WireBeforeAfter,
  Change as WireChange,
} from '../../../server/rpc/session/contract/index.ts';

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

export const messagesOf = (print: Blueprint | undefined) =>
  new Map(
    print
      ? [print.top, ...Object.values(print.state)].flatMap((level) =>
          Object.entries(level.on),
        )
      : [],
  );

export const encodedMessage = (
  root: Blueprint,
  to: string,
  message: { readonly _tag: string },
) =>
  trimmed(
    encoded(messagesOf(blueprintAt(root, to)).get(message._tag), message),
  );

const fieldOf = (schema: Schema.Top | undefined, name: string) => {
  const fields = (schema as { readonly fields?: unknown } | undefined)?.fields;
  return typeof fields === 'object' && fields !== null
    ? (fields as Readonly<Record<string, Schema.Top>>)[name]
    : undefined;
};

const wireOf = (value: unknown) => trimmed(value);

const sides = (
  { before, after }: BeforeAfter,
  encode: (value: unknown) => unknown,
): WireBeforeAfter => ({
  ...(before === undefined ? {} : { before: wireOf(encode(before)) }),
  ...(after === undefined ? {} : { after: wireOf(encode(after)) }),
});

const fieldsOf = (
  fields: Readonly<Record<string, BeforeAfter>>,
  schema: Schema.Top | undefined,
) =>
  Object.fromEntries(
    Object.entries(fields).map(([name, change]) => [
      name,
      sides(change, (value) => encoded(fieldOf(schema, name), value)),
    ]),
  );

const stateOf = (
  print: Blueprint | undefined,
  state: { readonly _tag: string },
) => encoded(print?.state[state._tag]?.data, state);

const placeOf = ({
  address,
  actor,
  key,
}: {
  readonly address: string;
  readonly actor: string;
  readonly key?: string;
}) => ({ address, actor, ...(key === undefined ? {} : { key }) });

const wholeOf = (whole: Whole, print: Blueprint | undefined) => ({
  ...placeOf(whole),
  state: wireOf(stateOf(print, whole.state)),
  model: wireOf(encoded(print?.schemas.model, whole.model)),
  ...(whole.props === undefined
    ? {}
    : { props: wireOf(encoded(print?.schemas.props, whole.props)) }),
  workers: whole.workers,
});

export const encodedChange = (root: Blueprint, change: Change): WireChange => {
  const print = blueprintAt(root, change.address);
  if (change._tag !== 'Changed')
    return { _tag: change._tag, ...wholeOf(change, print) };
  const { state } = change;
  return {
    _tag: 'Changed',
    ...placeOf(change),
    ...(state
      ? {
          state: {
            before: wireOf(stateOf(print, state.before)),
            after: wireOf(stateOf(print, state.after)),
            transition: state.transition,
          },
        }
      : {}),
    model: fieldsOf(change.model, print?.schemas.model),
    props: fieldsOf(change.props, print?.schemas.props),
    workers: change.workers,
  };
};
