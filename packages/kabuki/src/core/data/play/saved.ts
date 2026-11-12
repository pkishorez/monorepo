import type { Tagged } from '../../actor/index.ts';
import type { ActorDefinition, Encoding } from '../../actor/engine/index.ts';
import type { Entry, Instance } from './init.ts';
import { segmentToward } from './path.ts';
import { isRestore, restore } from './restore.ts';
import { actorFor, isMany, slotOf } from './tree.ts';

/*
 * Saved: a History as plain JSON. In memory every value is decoded; saved,
 * each Message, and each Instance of a Restore's tree, is its Actor's
 * Schemas' encoded side. So only that side must be JSON-safe.
 *
 * 1. Encode  an entry, through the Schemas of the Actor it is for, once per
 *            entry. One that does not fit is saved as it is: it never plays.
 * 2. Decode  an entry read back. One that no longer fits the code is kept
 *            as it was saved: Replay warns of it and skips it.
 * 3. Check   a saved History's shape before it is read: ids rise, but
 *            need not start at 0 or follow on, once it is Compacted.
 */

/**
 * A History as plain JSON, to keep and load again: every Message, and every
 * Instance of a Restore's tree, as its Actor's Schemas encode it.
 */
export interface SavedHistory {
  /** Oldest first, by id. */
  readonly entries: ReadonlyArray<Entry>;
  readonly head: number | null;
}

const encoded = new WeakMap<ActorDefinition, WeakMap<Entry, Entry>>();

const known = (root: ActorDefinition) => {
  let byEntry = encoded.get(root);
  if (!byEntry) encoded.set(root, (byEntry = new WeakMap()));
  return byEntry;
};

// 1. Encode
export const encodeEntry = (root: ActorDefinition, entry: Entry): Entry => {
  const cache = known(root);
  const found = cache.get(entry);
  if (found) return found;
  const written = Object.freeze(encode(root, entry));
  cache.set(entry, written);
  return written;
};

const encode = (root: ActorDefinition, entry: Entry): Entry => {
  const { message } = entry;
  // A value that does not fit its Schema is saved as it is: it was dropped
  // live, or Replay skips it, so it never plays.
  try {
    if (isRestore(message))
      return {
        ...entry,
        message: restore(convert(root, message.root, 'encode')),
      };
    const definition = actorFor(root, entry.to);
    return definition
      ? {
          ...entry,
          message: definition.encoding.message.encode(message) as Tagged,
        }
      : entry;
  } catch {
    return entry;
  }
};

// 2. Decode
/** An entry read back; saving it again gives the entry it was read from. */
export const decodeEntry = (root: ActorDefinition, entry: Entry): Entry => {
  const decoded = decode(root, entry);
  if (decoded !== entry) known(root).set(decoded, entry);
  return decoded;
};

const decode = (root: ActorDefinition, entry: Entry): Entry => {
  const { message } = entry;
  try {
    if (isRestore(message))
      return {
        ...entry,
        message: restore(convert(root, message.root, 'decode')),
      };
    const definition = actorFor(root, entry.to);
    return definition
      ? {
          ...entry,
          message: definition.encoding.message.decode(message) as Tagged,
        }
      : entry;
  } catch {
    return entry;
  }
};

/** An Instance and every Child under it, each through its own Actor's Schemas. */
const convert = (
  definition: ActorDefinition,
  instance: Instance,
  way: keyof Encoding,
): Instance => {
  const { model, state, props } = definition.encoding;
  const child = (slot: string, held: Instance) => {
    const segment = segmentToward(instance.address, held.address);
    const wanted = segment && slotOf(definition, segment);
    if (!wanted || segment.slot !== slot)
      throw new Error(`no Child "${slot}" in ${definition.name}`);
    return convert(wanted.definition, held, way);
  };
  return {
    ...instance,
    state: state[way](instance.state) as Instance['state'],
    model: model[way](instance.model),
    ...('props' in instance ? { props: props[way](instance.props) } : {}),
    children: Object.fromEntries(
      Object.entries(instance.children).map(([slot, held]) => [
        slot,
        isMany(held) ? held.map((one) => child(slot, one)) : child(slot, held),
      ]),
    ),
  };
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
