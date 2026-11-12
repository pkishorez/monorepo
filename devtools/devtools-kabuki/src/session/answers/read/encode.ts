import { Schema } from 'effect';
import { Address, Blueprint, History, Snapshot } from '@kestack/kabuki';
import type { Entry, Instance } from '@kestack/kabuki';
import type { AnyActor } from '@kestack/kabuki/core/actor';

/*
 * The app's values as they leave the tab: each through its own Actor's
 * Schemas, as its Blueprint holds them, the same encoded side a saved
 * History holds, so they are JSON.
 *
 * 1. Value     one value; one that does not fit its Schema goes as it is.
 * 2. Instance  an Instance and every Child under it, each by its own
 *              Actor, found in the root's Blueprint by its Address's place.
 * 3. Entries   a History's entries, as `History.save` encodes them.
 */

type Encode = (value: unknown) => unknown;

// 1. Value
const encoders = new WeakMap<Schema.Top, Encode>();

/** How a Schema encodes a value, made once per Schema. */
export const encoderOf = (schema: Schema.Top | undefined): Encode => {
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

// 2. Instance
/** The Blueprint of the Actor an Instance runs: its place in the root's. */
export const blueprintAt = (
  root: Blueprint,
  address: string,
): Blueprint | undefined =>
  Blueprint.at(root, Address.place(address as Address));

/** An Instance's State, Model and Props, each by its Actor's Schema. */
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

/** The key it is held under, if any: the end of its Address. */
export const keyOf = (address: string): string | undefined =>
  Address.parse(address as Address).path.at(-1)?.key;

/** An Instance as JSON: its Address, State, Model, Props and Children; not how many times it Invoked each. */
export const encodeInstance = (
  instance: Instance,
  root: Blueprint,
): Readonly<Record<string, unknown>> => {
  const key = keyOf(instance.address);
  return {
    address: instance.address,
    actor: instance.actor,
    ...(key === undefined ? {} : { key }),
    ...encodedData(instance, blueprintAt(root, instance.address)),
    started: instance.started,
    changed: instance.changed,
    children: Object.fromEntries(
      Object.entries(instance.children).map(([slot, held]) => [
        slot,
        Snapshot.isMany(held)
          ? held.map((one) => encodeInstance(one, root))
          : encodeInstance(held, root),
      ]),
    ),
  };
};

// 3. Entries
const saved = new WeakMap<object, ReadonlyMap<number, Entry>>();

/** Each entry the History keeps, by id, its Message encoded. */
export const encodedEntries = (
  actor: AnyActor,
  history: History,
): ReadonlyMap<number, Entry> => {
  // The same object for the same History.
  const save = History.save(actor, history);
  const kept = saved.get(save);
  if (kept) return kept;
  const byId = new Map(save.entries.map((entry) => [entry.id, entry]));
  saved.set(save, byId);
  return byId;
};
