import type { ActorDefinition } from '../../actor/index.ts';
import { parse, within } from '../address/index.ts';
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
  /** Its place in the slot's list, for a Child of an `each`. */
  readonly index?: number;
}

/** The Instances from the root down to `address`, with their Actors; none if it is gone. */
export const pathTo = (
  root: ActorDefinition,
  top: Instance,
  address: string,
): ReadonlyArray<Step> | undefined => {
  if (!within(top.address, address)) return undefined;
  const path: Array<Step> = [{ instance: top, definition: root, slot: '' }];
  for (let step = path[0]!; step.instance.address.length < address.length;) {
    const found = childToward(step.instance, address);
    const definition =
      found &&
      step.definition.children[step.instance.state._tag]?.[found.slot]
        ?.definition;
    if (!definition) return undefined;
    step = { ...found, definition };
    path.push(step);
  }
  return path;
};

/** The tree with the last Instance of `path` replaced by `after`. Every Instance off the path stays the same object. */
export const replace = (path: ReadonlyArray<Step>, after: Instance): Instance =>
  path.slice(0, -1).reduceRight((child, { instance }, index) => {
    const { slot, index: at } = path[index + 1]!;
    const held = instance.children[slot]!;
    return {
      ...instance,
      children: {
        ...instance.children,
        [slot]: isMany(held) ? listWith(held, at!, child) : child,
      },
    };
  }, after);

/** The Instance at this Address, if it is in the tree. */
export const instanceAt = (
  top: Instance,
  address: string,
): Instance | undefined => {
  if (!within(top.address, address)) return undefined;
  let instance: Instance | undefined = top;
  while (instance && instance.address.length < address.length)
    instance = childToward(instance, address)?.instance;
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

/**
 * The Child of `parent` on the way down to `address`, which is below it:
 * the next segment of `address` names its slot, and its whole Address ends
 * there.
 */
const childToward = (
  parent: Instance,
  address: string,
): Omit<Step, 'definition'> | undefined => {
  const at = parent.address.length + 1;
  const slash = address.indexOf('/', at);
  const end = slash < 0 ? address.length : slash;
  const segment = address.slice(at, end);
  const slot = slotIn(segment);
  if (!Object.hasOwn(parent.children, slot)) return undefined;
  const held = parent.children[slot]!;
  if (isMany(held)) {
    const index = indexOf(held).get(segment);
    return index === undefined
      ? undefined
      : { instance: held[index]!, slot, index };
  }
  // Its parent's Address is the start of `address`, so only its own segment is left.
  return held.address.length === end && held.address.endsWith(segment)
    ? { instance: held, slot }
    : undefined;
};

/** The slot a segment names: `State:slot[key]#n`, the State and the key optional. */
const slotIn = (segment: string): string => {
  const start = segment.indexOf(':') + 1;
  const key = segment.indexOf('[', start);
  return segment.slice(start, key < 0 ? segment.indexOf('#', start) : key);
};

/**
 * Where each Instance of an `each` list is, by the last segment of its
 * Address. A list never changes, so its index never goes stale; and
 * `replace` puts a new Instance at the same Address in the same place, so
 * the copy it makes keeps the same index.
 */
const indexes = new WeakMap<ReadonlyArray<Instance>, Map<string, number>>();

const indexOf = (list: ReadonlyArray<Instance>): Map<string, number> => {
  let index = indexes.get(list);
  if (!index) {
    index = new Map(
      list.map(({ address }, at) => [
        address.slice(address.lastIndexOf('/') + 1),
        at,
      ]),
    );
    indexes.set(list, index);
  }
  return index;
};

/** The list with `child` in place `at`, keeping the list's index. */
const listWith = (
  list: ReadonlyArray<Instance>,
  at: number,
  child: Instance,
): ReadonlyArray<Instance> => {
  const copy = list.slice();
  copy[at] = child;
  const index = indexes.get(list);
  if (index) indexes.set(copy, index);
  return copy;
};
