import type { ActorDefinition } from '../../actor/index.ts';
import { parse, segmentToward, within } from '../address/index.ts';
import type { Segment } from '../address/index.ts';
import type { Instance } from './instance.ts';

/*
 * The tree: where each Instance sits, found by walking its Address down
 * from the root, one segment at a time.
 */

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

/** The Instances from the root down to `address`, with their Actors; none if it is gone. */
export const pathTo = (
  root: ActorDefinition,
  top: Instance,
  address: string,
): ReadonlyArray<Step> | undefined => {
  const path: Array<Step> = [{ instance: top, definition: root, slot: '' }];
  for (let step = path[0]!; step.instance.address !== address;) {
    const segment = segmentToward(step.instance.address, address);
    if (segment === undefined) return undefined;
    const { slot } = segment;
    const definition =
      step.definition.children[step.instance.state._tag]?.[slot]?.definition;
    const child = childToward(step.instance.children[slot], address);
    if (!definition || !child) return undefined;
    step = { instance: child, definition, slot };
    path.push(step);
  }
  return path;
};

/** The tree with the last Instance of `path` replaced by `after`. Every Instance off the path stays the same object. */
export const replace = (path: ReadonlyArray<Step>, after: Instance): Instance =>
  path.slice(0, -1).reduceRight((child, { instance }, index) => {
    const { slot } = path[index + 1]!;
    const held = instance.children[slot]!;
    return {
      ...instance,
      children: {
        ...instance.children,
        [slot]: isMany(held)
          ? held.map((kept) => (kept.address === child.address ? child : kept))
          : child,
      },
    };
  }, after);

/** The Instance at this Address, if it is in the tree. */
export const instanceAt = (
  top: Instance,
  address: string,
): Instance | undefined => {
  let instance: Instance | undefined = top;
  while (instance && instance.address !== address) {
    const segment = segmentToward(instance.address, address);
    instance =
      segment === undefined
        ? undefined
        : childToward(instance.children[segment.slot], address);
  }
  return instance;
};

/** The Actor of the Instance at this Address, if it is in the tree. */
export const actorAt = (
  root: ActorDefinition,
  top: Instance,
  address: string,
): ActorDefinition | undefined =>
  pathTo(root, top, address)?.at(-1)?.definition;

/**
 * The Actor an Instance at this Address is, read from the Address alone:
 * the Actor written at each segment's slot, at the top or in its State.
 * None if a segment names no Child the code writes there.
 */
export const actorFor = (
  root: ActorDefinition,
  address: string,
): ActorDefinition | undefined => {
  const parsed = parse(address);
  if (!parsed || parsed.root !== root.name) return undefined;
  let at: ActorDefinition | undefined = root;
  for (const segment of parsed.path) at = at && slotOf(at, segment)?.definition;
  return at;
};

/** The slot a segment names in an Actor: written at the top, or in the State it names. */
export const slotOf = (definition: ActorDefinition, segment: Segment) => {
  const { state, slot } = segment;
  const top = definition.lasting.includes(slot);
  if (state === undefined)
    return top ? definition.children[definition.states[0]!]?.[slot] : undefined;
  return !top && definition.states.includes(state)
    ? definition.children[state]?.[slot]
    : undefined;
};

const childToward = (
  held: Instance | ReadonlyArray<Instance> | undefined,
  address: string,
): Instance | undefined =>
  held === undefined
    ? undefined
    : isMany(held)
      ? held.find((child) => within(child.address, address))
      : within(held.address, address)
        ? held
        : undefined;
