import type { Tagged } from '../../actor/index.ts';
import type { ActorDefinition } from '../../actor/engine/index.ts';
import { counterOf, segmentToward } from './path.ts';
import type { Instance } from './init.ts';
import { isMany } from './tree.ts';

/*
 * Restore: a Message to the root that replaces the whole tree with one saved
 * before. The only Message no Update sees.
 *
 * 1. Check  every Instance against its Actor: its Address, its Actor's name,
 *           its State, its Model, its Props, the entries that started and
 *           changed it, and its Children's slots, every one its State always
 *           holds and no other. One that does not match is a reason, and the
 *           Restore is ignored.
 * 2. Clamp  the entries that started and changed each Instance to the
 *           Restore's own: nothing after it has happened yet. A Snapshot
 *           folded from the same History is put back as it was.
 */

export const RESTORE = '@kestack/kabuki/Restore';

export interface Restore extends Tagged {
  readonly _tag: typeof RESTORE;
  /** The root Instance to put in place, with everything under it. */
  readonly root: Instance;
}

export const isRestore = (message: Tagged): message is Restore =>
  message._tag === RESTORE;

export const restore = (root: Instance): Restore => ({ _tag: RESTORE, root });

// 1. Check
/** The saved tree if every Instance in it matches its Actor, else why not. */
export const checkRestore = (
  root: ActorDefinition,
  { root: saved }: Restore,
): { readonly root: Instance } | { readonly reason: string } => {
  if (saved?.address !== root.name)
    return { reason: `its root is ${saved?.address}, not ${root.name}` };
  const reason = check(root, saved);
  return reason === undefined ? { root: saved } : { reason };
};

const isEntry = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isInteger(value));

const check = (
  definition: ActorDefinition,
  instance: Instance,
): string | undefined => {
  const { address } = instance;
  if (instance.actor !== definition.name)
    return `${address} is a ${instance.actor}, not a ${definition.name}`;
  if (!isEntry(instance.started) || !isEntry(instance.changed))
    return `${address} does not say which entries started and changed it`;
  const tag = instance.state._tag;
  if (!definition.states.includes(tag))
    return `${address} is in ${tag}, which ${definition.name} has no State for`;
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
      const counted = instance.invoked[counterOf(slot, segment.key)] ?? 0;
      if (!(segment.n <= counted))
        return `${address} has Invoked "${slot}" ${counted} times, but holds ${child.address}`;
      const reason = check(wanted.definition, child);
      if (reason !== undefined) return reason;
    }
  }
  return undefined;
};

// 2. Clamp
/** The tree with no entry after `entry` starting or changing anything: the same objects where none does. */
export const clamp = (instance: Instance, entry: number): Instance => {
  const started =
    instance.started === null ? null : Math.min(instance.started, entry);
  const changed =
    instance.changed === null ? null : Math.min(instance.changed, entry);
  let children: Record<string, Instance | ReadonlyArray<Instance>> | undefined;
  for (const [slot, held] of Object.entries(instance.children)) {
    const after = isMany(held)
      ? held.map((child) => clamp(child, entry))
      : clamp(held, entry);
    const same = isMany(held)
      ? (after as ReadonlyArray<Instance>).every(
          (child, index) => child === held[index],
        )
      : after === held;
    if (!same) (children ??= { ...instance.children })[slot] = after;
  }
  return started === instance.started &&
    changed === instance.changed &&
    children === undefined
    ? instance
    : { ...instance, started, changed, ...(children ? { children } : {}) };
};
