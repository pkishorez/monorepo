import type { ActorDefinition, Encoding } from '../actor/index.ts';
import { counterOf, segmentToward } from './address/index.ts';
import { isMany, slotOf } from './instance/index.ts';
import type { Instance, Snapshot } from './instance/index.ts';

/*
 * Saved: a Snapshot as plain JSON. In memory every value is decoded; saved,
 * each Instance's State, Model and Props are its Actor's Schemas' encoded
 * side. So only that side must be JSON-safe.
 *
 * 1. Save   every Instance through its own Actor's Schemas, once per
 *           Snapshot.
 * 2. Load   read it back with the code as it is now, and check every
 *           Instance against its Actor: one that no longer fits throws,
 *           saying why, so an app never runs from data its code cannot
 *           read.
 */

/** A Snapshot as plain JSON, to keep and load again: every Instance as its Actor's Schemas encode it. */
export interface SavedSnapshot {
  readonly root: Instance;
  readonly at: number;
}

// 1. Save
const saves = new WeakMap<ActorDefinition, WeakMap<Snapshot, SavedSnapshot>>();

/** The Snapshot as plain JSON: the same object for the same Snapshot. */
export const save = (
  root: ActorDefinition,
  snapshot: Snapshot,
): SavedSnapshot => {
  let known = saves.get(root);
  if (!known) saves.set(root, (known = new WeakMap()));
  let saved = known.get(snapshot);
  if (!saved)
    known.set(
      snapshot,
      (saved = Object.freeze({
        root: convert(root, snapshot.root, 'encode'),
        at: snapshot.at,
      })),
    );
  return saved;
};

// 2. Load
/** A Snapshot saved before, read with the Actor's code as it is now. Throws, saying why, if it no longer fits. */
export const load = (root: ActorDefinition, saved: SavedSnapshot): Snapshot => {
  if (!saved || typeof saved !== 'object' || !saved.root)
    throw new TypeError(
      '[@kestack/kabuki] the saved Snapshot is corrupt: it has no root',
    );
  if (typeof saved.at !== 'number' || !Number.isFinite(saved.at))
    throw new TypeError(
      `[@kestack/kabuki] the saved Snapshot is corrupt: its Time is ${saved.at}`,
    );
  if (saved.root.address !== root.name)
    throw mismatch(root, `its root is ${saved.root.address}, not ${root.name}`);
  let decoded: Instance;
  let reason: string | undefined;
  try {
    decoded = convert(root, saved.root, 'decode');
    reason = fits(root, decoded);
  } catch (error) {
    throw mismatch(root, (error as Error).message);
  }
  if (reason !== undefined) throw mismatch(root, reason);
  return { root: decoded, at: saved.at };
};

const mismatch = (root: ActorDefinition, reason: string) =>
  new Error(
    `[@kestack/kabuki] the saved Snapshot no longer fits ${root.name}: ${reason}`,
  );

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
      throw new Error(`${definition.name} has no Child "${slot}"`);
    return convert(wanted.definition, held, way);
  };
  /** One value through its Schema: one that does not fit says whose it is. */
  const through = (what: string, run: () => unknown) => {
    try {
      return run();
    } catch (error) {
      throw new Error(
        `the ${what} of ${instance.address} does not match its Schema: ${(error as Error).message}`,
      );
    }
  };
  return {
    ...instance,
    state: through('State', () =>
      state[way](instance.state),
    ) as Instance['state'],
    model: through('Model', () => model[way](instance.model)),
    ...('props' in instance
      ? { props: through('Props', () => props[way](instance.props)) }
      : {}),
    children: Object.fromEntries(
      Object.entries(instance.children).map(([slot, held]) => [
        slot,
        isMany(held) ? held.map((one) => child(slot, one)) : child(slot, held),
      ]),
    ),
  };
};

/**
 * Why a tree does not fit the root's Actor, if it does not: every Instance
 * is checked against its Actor: its Address, its Actor's name, its State,
 * its Model, its Props, and its Children's slots, every one its State
 * always holds and no other.
 */
export const fits = (
  root: ActorDefinition,
  instance: Instance,
): string | undefined =>
  instance?.address !== root.name
    ? `its root is ${instance?.address}, not ${root.name}`
    : check(root, instance);

const check = (
  definition: ActorDefinition,
  instance: Instance,
): string | undefined => {
  const { address } = instance;
  if (instance.actor !== definition.name)
    return `${address} is a ${instance.actor}, not a ${definition.name}`;
  const tag = instance.state?._tag;
  if (!definition.states.includes(tag))
    return `${address} is in ${tag}, which ${definition.name} has no State for`;
  if (instance._tag !== tag)
    return `${address} says it is in ${instance._tag}, but its State is ${tag}`;
  try {
    definition.check.model(instance.model, `the Model of ${address}`);
    definition.check.state(instance.state, `the State of ${address}`);
    definition.check.props(instance.props, `the Props of ${address}`);
  } catch (error) {
    return (error as Error).message;
  }
  const slots = definition.children[tag] ?? {};
  for (const [slot, { kind }] of Object.entries(slots))
    if (kind !== 'while' && !(slot in instance.children))
      return `${address} is in ${tag}, which Invokes "${slot}", but holds no such Child`;
  for (const [slot, held] of Object.entries(instance.children)) {
    const wanted = slots[slot];
    if (!wanted)
      return `${address} has a Child "${slot}" that ${tag} does not Invoke`;
    const many = wanted.kind === 'each';
    if (isMany(held) !== many)
      return `${address}'s Child "${slot}" is ${many ? '' : 'not '}keyed`;
    const state = definition.lasting.includes(slot) ? undefined : tag;
    for (const child of isMany(held) ? held : [held]) {
      const segment = segmentToward(address, child.address);
      const own =
        segment !== undefined &&
        !child.address.slice(address.length + 1).includes('/');
      if (!own || segment.slot !== slot || segment.state !== state)
        return `${child.address} is not under ${address}'s "${slot}"`;
      if ((segment.key !== undefined) !== (many || wanted.keyed))
        return `${child.address} is ${many || wanted.keyed ? 'not ' : ''}held under a key`;
      if (child.key !== segment.key)
        return `${child.address} says its key is ${child.key}`;
      const counted = instance.invoked?.[counterOf(slot, segment.key)] ?? 0;
      if (!(segment.n <= counted))
        return `${address} has Invoked "${slot}" ${counted} times, but holds ${child.address}`;
      const reason = check(wanted.definition, child);
      if (reason !== undefined) return reason;
    }
  }
  return undefined;
};
