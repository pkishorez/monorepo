import type { ActorDefinition } from '../../actor/index.ts';
import type { Instance, Snapshot } from './snapshot.ts';

/*
 * The tree: where each Instance sits. An Instance's ID is its path from the
 * root: its parent's ID, the Child's name, its key if it has one, and how
 * many times the parent has Invoked that Child. So the same Messages always
 * give the same IDs, an Instance Invoked again gets a new one, and finding
 * an Instance walks straight down to it.
 *
 *   Auth                  the root, named after its Actor
 *   Auth/api#2            the second `api` Auth Invoked
 *   Auth/api#2/rows[a]#1  the first `rows` keyed `a` under it
 */

export const childId = (
  parent: string,
  slot: string,
  key: string | undefined,
  generation: number,
): string =>
  `${parent}/${slot}${key === undefined ? '' : `[${encodeURIComponent(key)}]`}#${generation}`;

/** What the parent counts its Invocations of a Child under. */
export const counterOf = (slot: string, key: string | undefined): string =>
  key === undefined ? slot : `${slot}[${encodeURIComponent(key)}]`;

/** Whether `id` is `ancestor` or below it. */
export const within = (ancestor: string, id: string): boolean =>
  id === ancestor || id.startsWith(`${ancestor}/`);

/** The slot under `parent` on the way down to `id`, if `id` is below it. */
export const slotToward = (parent: string, id: string): string | undefined => {
  if (!id.startsWith(`${parent}/`)) return undefined;
  const rest = id.slice(parent.length + 1);
  const end = rest.search(/[[#]/);
  return end < 0 ? undefined : rest.slice(0, end);
};

/** Tells the list of an `each` Child from one Instance in an Instance's Children. */
export const isMany = (
  held: Instance | ReadonlyArray<Instance>,
): held is ReadonlyArray<Instance> => Array.isArray(held);

/** One Instance on the way down, with its Actor and the slot it sits in. */
export interface Step {
  readonly instance: Instance;
  readonly definition: ActorDefinition;
  readonly slot: string;
}

/** The Instances from the root down to `id`, with their Actors; none if it is gone. */
export const pathTo = (
  root: ActorDefinition,
  snapshot: Snapshot,
  id: string,
): ReadonlyArray<Step> | undefined => {
  const path: Array<Step> = [
    { instance: snapshot, definition: root, slot: '' },
  ];
  for (let step = path[0]!; step.instance.id !== id;) {
    const slot = slotToward(step.instance.id, id);
    if (slot === undefined) return undefined;
    const definition =
      step.definition.children[step.instance.state._tag]?.[slot]?.definition;
    const child = childToward(step.instance.children[slot], id);
    if (!definition || !child) return undefined;
    step = { instance: child, definition, slot };
    path.push(step);
  }
  return path;
};

/** The Snapshot with the last Instance of `path` replaced by `after`. Every Instance off the path stays the same object. */
export const replace = (path: ReadonlyArray<Step>, after: Instance): Snapshot =>
  path.slice(0, -1).reduceRight((child, { instance }, index) => {
    const { slot } = path[index + 1]!;
    const held = instance.children[slot]!;
    return {
      ...instance,
      children: {
        ...instance.children,
        [slot]: isMany(held)
          ? held.map((kept) => (kept.id === child.id ? child : kept))
          : child,
      },
    };
  }, after);

/** The Instance with this ID, if it is in the Snapshot. */
export const instanceAt = (
  snapshot: Snapshot,
  id: string,
): Instance | undefined => {
  let instance: Instance | undefined = snapshot;
  while (instance && instance.id !== id) {
    const slot = slotToward(instance.id, id);
    instance =
      slot === undefined ? undefined : childToward(instance.children[slot], id);
  }
  return instance;
};

/** The Actor of the Instance with this ID, if it is in the Snapshot. */
export const actorAt = (
  root: ActorDefinition,
  snapshot: Snapshot,
  id: string,
): ActorDefinition | undefined =>
  pathTo(root, snapshot, id)?.at(-1)?.definition;

const childToward = (
  held: Instance | ReadonlyArray<Instance> | undefined,
  id: string,
): Instance | undefined =>
  held === undefined
    ? undefined
    : isMany(held)
      ? held.find((child) => within(child.id, id))
      : within(held.id, id)
        ? held
        : undefined;
