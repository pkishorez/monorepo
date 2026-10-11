import type { Definition, Tagged } from '../actor/index.ts';
import { counterOf, slotToward } from './id.ts';
import { isMany } from './many.ts';
import type { Instance, Snapshot } from './snapshot.ts';

/*
 * Restore: a Message to the root that replaces the whole Snapshot with one
 * saved before. The only Message no Update sees. Before it is put in place,
 * every Instance is checked against its Actor: its ID, its Actor's name, its
 * State, its Model, its Props and its Children's slots; one that does not
 * match is a reason, and the Restore is ignored.
 */

export const RESTORE = '@effect-oak/Restore';

export interface Restore extends Tagged {
  readonly _tag: typeof RESTORE;
  readonly snapshot: Snapshot;
}

export const isRestore = (message: Tagged): message is Restore =>
  message._tag === RESTORE;

export const restore = (snapshot: Snapshot): Restore => ({
  _tag: RESTORE,
  snapshot,
});

/** The saved Snapshot if every Instance in it matches its Actor, else why not. */
export const checkRestore = (
  root: Definition,
  { snapshot }: Restore,
): { readonly snapshot: Snapshot } | { readonly reason: string } => {
  if (snapshot.id !== root.name)
    return { reason: `its root is ${snapshot.id}, not ${root.name}` };
  const reason = check(root, snapshot, undefined);
  return reason === undefined ? { snapshot } : { reason };
};

const check = (
  definition: Definition,
  instance: Instance,
  key: string | undefined,
): string | undefined => {
  const { id } = instance;
  if (instance.actor !== definition.name)
    return `${id} is a ${instance.actor}, not a ${definition.name}`;
  if (instance.key !== key) return `${id} has the key ${instance.key}`;
  const tag = instance.state._tag;
  if (!definition.states.includes(tag))
    return `${id} is in ${tag}, which ${definition.name} has no State for`;
  try {
    definition.check.model(instance.model, `the Model of ${id}`);
    definition.check.state(instance.state, `the State of ${id}`);
    definition.check.props(instance.props, `the Props of ${id}`);
  } catch (error) {
    return (error as Error).message;
  }
  const slots = definition.children[tag] ?? {};
  for (const [slot, held] of Object.entries(instance.children)) {
    const wanted = slots[slot];
    if (!wanted)
      return `${id} has a Child "${slot}" that ${tag} does not Invoke`;
    if (isMany(held) !== wanted.many)
      return `${id}'s Child "${slot}" is ${wanted.many ? '' : 'not '}keyed`;
    for (const child of isMany(held) ? held : [held]) {
      if (slotToward(id, child.id) !== slot)
        return `${child.id} is not under ${id}'s "${slot}"`;
      const generation = Number(child.id.slice(child.id.lastIndexOf('#') + 1));
      const counted = instance.invoked[counterOf(slot, child.key)] ?? 0;
      if (!(generation <= counted))
        return `${id} has Invoked "${slot}" ${counted} times, but holds ${child.id}`;
      const reason = check(
        wanted.definition,
        child,
        isMany(held) ? child.key : undefined,
      );
      if (reason !== undefined) return reason;
    }
  }
  return undefined;
};
