import type { ActorDefinition, Encoding, Tagged } from '../actor/index.ts';
import { Snapshot, isRestore, restore } from '../snapshot/index.ts';
import type { Instance } from '../snapshot/index.ts';
import type { Entry, SavedHistory } from './history.ts';

/*
 * Saved: a History as plain JSON. In memory every value is decoded; saved,
 * each Message, and each Instance of a Restore's Snapshot, is its Actor's
 * Schemas' encoded side. So only that side must be JSON-safe.
 *
 * 1. Encode  an entry, through the Schemas of the Actor it is for. One that
 *            does not fit is saved as it is: it never plays.
 * 2. Decode  an entry read back. One that no longer fits the code is kept
 *            as it was saved: Replay warns of it and skips it.
 * 3. Check   a saved History's shape before it is read: ids rise, but
 *            need not start at 0 or follow on, once it is Compacted.
 */

// 1. Encode
export const encodeEntry = (root: ActorDefinition, entry: Entry): Entry => {
  const { message } = entry;
  // A value that does not fit its Schema is saved as it is: it was dropped
  // live, or Replay skips it, so it never plays.
  if (isRestore(message))
    try {
      return {
        ...entry,
        message: restore(convert(root, message.snapshot, 'encode')),
      };
    } catch {
      return entry;
    }
  for (const definition of actorsAt(root, entry.destination))
    try {
      return {
        ...entry,
        message: definition.encoding.message.encode(message) as Tagged,
      };
    } catch {}
  return entry;
};

// 2. Decode
export const decodeEntry = (root: ActorDefinition, entry: Entry): Entry => {
  const { message } = entry;
  try {
    if (isRestore(message))
      return {
        ...entry,
        message: restore(convert(root, message.snapshot, 'decode')),
      };
  } catch {
    return entry;
  }
  for (const definition of actorsAt(root, entry.destination))
    try {
      return {
        ...entry,
        message: definition.encoding.message.decode(message) as Tagged,
      };
    } catch {}
  return entry;
};

/** An Instance and every Child under it, each through its own Actor's Schemas. */
const convert = (
  definition: ActorDefinition,
  instance: Instance,
  way: keyof Encoding,
): Instance => {
  const { model, state, props } = definition.encoding;
  const next = state[way](instance.state) as Instance['state'];
  const slots = definition.children[next._tag] ?? {};
  const child = (slot: string, held: Instance) => {
    const wanted = slots[slot];
    if (!wanted) throw new Error(`no Child "${slot}" in ${next._tag}`);
    return convert(wanted.definition, held, way);
  };
  return {
    ...instance,
    state: next,
    model: model[way](instance.model),
    ...('props' in instance ? { props: props[way](instance.props) } : {}),
    children: Object.fromEntries(
      Object.entries(instance.children).map(([slot, held]) => [
        slot,
        Snapshot.isMany(held)
          ? held.map((one) => child(slot, one))
          : child(slot, held),
      ]),
    ),
  };
};

/**
 * Every Actor an Instance with this ID can be, read from the ID alone: the
 * Actor of the slot at each step down, in any State. Usually one; a slot
 * name written in two States for two Actors gives both.
 */
/** The Actors an Instance ID can be one of in this code: none if a slot on its way no longer exists. */
export const actorsAt = (
  root: ActorDefinition,
  id: string,
): ReadonlyArray<ActorDefinition> => {
  // The root's name may hold a `/` itself; only what follows it is the path.
  if (id !== root.name && !id.startsWith(`${root.name}/`)) return [];
  const steps =
    id === root.name ? [] : id.slice(root.name.length + 1).split('/');
  let at: ReadonlyArray<ActorDefinition> = [root];
  for (const step of steps) {
    const slot = step.slice(0, step.search(/[[#]/));
    const next = new Set<ActorDefinition>();
    for (const definition of at)
      for (const slots of Object.values(definition.children)) {
        const found = slots?.[slot]?.definition;
        if (found) next.add(found);
      }
    at = [...next];
  }
  return at;
};

// 3. Check
/** Throws, saying what is wrong, unless `saved` is a History's shape: entries by rising id, each after an earlier one, and a Head among them. */
export const checkSaved = (saved: SavedHistory): void => {
  const fail = (why: string) => {
    throw new TypeError(
      `[@kestack/kabuki] the saved History is corrupt: ${why}`,
    );
  };
  if (!saved || !Array.isArray(saved.entries)) fail('it has no entries');
  const seen = new Set<number>();
  let last = -1;
  saved.entries.forEach((entry, index) => {
    const id = entry?.id;
    if (!(Number.isInteger(id) && id > last))
      fail(`entry ${index} has the id ${id}, not one after ${last}`);
    const { parent } = entry;
    if (parent !== null && !seen.has(parent))
      fail(`entry ${id} follows ${parent}, not an entry before it`);
    seen.add(id);
    last = id;
  });
  const { head } = saved;
  if (head !== null && !seen.has(head))
    fail(`its Head ${head} is not one of its ${saved.entries.length} entries`);
};
