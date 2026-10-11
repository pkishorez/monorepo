import type { Definition } from '../actor/index.ts';
import { equal } from './equal.ts';
import { childId, counterOf } from './id.ts';
import type { Instance } from './snapshot.ts';

/*
 * Invoke: the State, and for keyed Children the Model, say which Children
 * exist, and the parent's data says what each is handed. Pure: Instances are
 * created by running init, never by Effects.
 *
 * 1. Create  an Instance runs init from its Input and enters its State. The
 *            Input, the Props, and the Model and State init gives, are
 *            checked against the Actor's Schemas.
 * 2. Enter   a State Invokes every Child it writes, fresh; a Child written
 *            at the top lasts as long as its Instance.
 * 3. Follow  in the same State, keyed Children follow the Model by key: a new
 *            key Invokes a Child, a key gone stops it, a key kept keeps it.
 *            Every Child kept is handed its Props again: new ones give it a
 *            new Instance, and its own Children follow them in turn.
 */

type Counters = Record<string, number>;
/** What a parent hands one Child: its Input, read once by init, and its Props, read live. */
type Given = { readonly input?: unknown; readonly props?: unknown };
type Keyed = Given & { readonly key: string };

const SINGLE = { _tag: 'Single' } as const;

// 1. Create
export const create = (
  definition: Definition,
  id: string,
  key: string | undefined,
  { input, props }: Given,
): Instance => {
  definition.check.input(input, `the Input of ${id}`);
  definition.check.props(props, `the Props of ${id}`);
  const init = definition.init(input);
  const model = init.model ?? {};
  const state = init.state ?? SINGLE;
  definition.check.model(model, `the Model init gave ${id}`);
  definition.check.state(state, `the State init gave ${id}`);
  return enter(definition, {
    id,
    actor: definition.name,
    ...(key === undefined ? {} : { key }),
    model,
    state,
    ...(props === undefined ? {} : { props }),
    children: {},
    invoked: {},
  });
};

// 2. Enter
/**
 * Enter the Instance's State: every Child the State writes is Invoked fresh.
 * A Child written at the top lasts through the Transition; then every Child
 * follows the parent's data.
 */
export const enter = (definition: Definition, instance: Instance): Instance => {
  const slots = definition.children[instance.state._tag];
  if (!slots) return { ...instance, children: {} };
  const invocation = invocationOf(definition, instance);
  const invoked: Counters = { ...instance.invoked };
  const children: Record<string, Instance | ReadonlyArray<Instance>> = {};
  for (const [slot, { definition: child, many }] of Object.entries(slots)) {
    const kept = definition.lasting.includes(slot)
      ? instance.children[slot]
      : undefined;
    children[slot] =
      kept ??
      (many
        ? keyedIn(invocation, slot).map((given) =>
            invoke(child, instance.id, slot, given.key, given, invoked),
          )
        : invoke(
            child,
            instance.id,
            slot,
            undefined,
            givenIn(invocation, slot),
            invoked,
          ));
  }
  return follow(definition, { ...instance, children, invoked });
};

// 3. Follow
export const follow = (
  definition: Definition,
  instance: Instance,
): Instance => {
  const slots = Object.entries(definition.children[instance.state._tag] ?? {});
  if (slots.length === 0) return instance;
  const invocation = invocationOf(definition, instance);
  let invoked: Counters | undefined;
  let children: Record<string, Instance | ReadonlyArray<Instance>> | undefined;
  for (const [slot, { definition: child, many }] of slots) {
    if (!many) {
      const held = instance.children[slot] as Instance | undefined;
      if (!held) continue;
      const handed = handedProps(child, held, givenIn(invocation, slot).props);
      if (handed !== held)
        (children ??= { ...instance.children })[slot] = handed;
      continue;
    }
    const before = (instance.children[slot] ?? []) as ReadonlyArray<Instance>;
    const byKey = new Map(before.map((kept) => [kept.key, kept]));
    const wanted = keyedIn(invocation, slot);
    let changed = wanted.length !== before.length;
    const after = wanted.map((given, index) => {
      const kept = byKey.get(given.key);
      if (kept) {
        const handed = handedProps(child, kept, given.props);
        if (before[index] !== handed) changed = true;
        return handed;
      }
      changed = true;
      invoked ??= { ...instance.invoked };
      return invoke(child, instance.id, slot, given.key, given, invoked);
    });
    if (changed) (children ??= { ...instance.children })[slot] = after;
  }
  return children
    ? { ...instance, children, invoked: invoked ?? instance.invoked }
    : instance;
};

/** A Child kept, with the Props it is handed now: the same Instance while they say the same. */
const handedProps = (
  definition: Definition,
  child: Instance,
  props: unknown,
): Instance => {
  if (equal(child.props, props)) return child;
  definition.check.props(props, `the Props of ${child.id}`);
  const { props: _, ...rest } = child;
  return follow(definition, props === undefined ? rest : { ...rest, props });
};

const invoke = (
  definition: Definition,
  parent: string,
  slot: string,
  key: string | undefined,
  given: Given,
  invoked: Counters,
): Instance => {
  const counter = counterOf(slot, key);
  const generation = (invoked[counter] ?? 0) + 1;
  invoked[counter] = generation;
  return create(definition, childId(parent, slot, key, generation), key, given);
};

const invocationOf = (
  definition: Definition,
  instance: Instance,
): Readonly<Record<string, unknown>> =>
  definition.invoke[instance.state._tag]?.({
    model: instance.model,
    state: instance.state,
    props: instance.props,
  }) ?? {};

const givenIn = (
  invocation: Readonly<Record<string, unknown>>,
  slot: string,
): Given => (invocation[slot] ?? {}) as Given;

const keyedIn = (
  invocation: Readonly<Record<string, unknown>>,
  slot: string,
): ReadonlyArray<Keyed> => {
  const keyed = (invocation[slot] ?? []) as ReadonlyArray<Keyed>;
  const seen = new Set<string>();
  for (const { key } of keyed) {
    if (seen.has(key))
      throw new Error(`[effect-oak] ${slot}: key "${key}" is Invoked twice`);
    seen.add(key);
  }
  return keyed;
};
