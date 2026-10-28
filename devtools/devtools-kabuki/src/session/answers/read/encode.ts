import { isMany } from '@kestack/kabuki';
import type {
  ActorDefinition,
  Entry,
  History,
  Instance,
} from '@kestack/kabuki';

/*
 * The app's values as they leave the tab: each through its own Actor's
 * Schemas, the same encoded side a saved History holds, so they are JSON.
 *
 * 1. Value     one value; one that does not fit its Schema goes as it is.
 * 2. Instance  an Instance and every Child under it, each by its own Actor.
 * 3. Entries   a History's entries, from what it saves.
 */

type Encode = (value: unknown) => unknown;

// 1. Value
export const encoded = (encode: Encode, value: unknown): unknown => {
  try {
    return encode(value);
  } catch {
    return value;
  }
};

// 2. Instance
/** An Instance as JSON: its State, Model, Props and Children; not how many times it Invoked each. */
export const encodeInstance = (
  instance: Instance,
  definition: ActorDefinition,
): Readonly<Record<string, unknown>> => {
  const { encoding } = definition;
  const slots = definition.children[instance.state._tag] ?? {};
  const child = (slot: string, held: Instance) => {
    const actor = slots[slot]?.definition;
    return actor ? encodeInstance(held, actor) : held;
  };
  return {
    id: instance.id,
    actor: instance.actor,
    ...(instance.key === undefined ? {} : { key: instance.key }),
    state: encoded(encoding.state.encode, instance.state),
    model: encoded(encoding.model.encode, instance.model),
    ...('props' in instance
      ? { props: encoded(encoding.props.encode, instance.props) }
      : {}),
    children: Object.fromEntries(
      Object.entries(instance.children).map(([slot, held]) => [
        slot,
        isMany(held) ? held.map((one) => child(slot, one)) : child(slot, held),
      ]),
    ),
  };
};

// 3. Entries
const saved = new WeakMap<object, ReadonlyMap<number, Entry>>();

/** Each entry the History keeps, by id, its Message encoded. */
export const encodedEntries = (
  history: History,
): ReadonlyMap<number, Entry> => {
  // The same object until the History changes.
  const save = history.save();
  const kept = saved.get(save);
  if (kept) return kept;
  const byId = new Map(save.entries.map((entry) => [entry.id, entry]));
  saved.set(save, byId);
  return byId;
};
