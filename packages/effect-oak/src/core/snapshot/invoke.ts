import type { Definition } from '../actor/index.ts';
import { childId, counterOf } from './id.ts';
import type { Instance } from './snapshot.ts';

/*
 * Invoke: the State, and for keyed Children the Model, say which Children
 * exist. Pure: Instances are created by running init, never by Effects.
 *
 * 1. Create  an Instance runs init from its Input and enters its State.
 * 2. Enter   a State Invokes every Child it has, fresh.
 * 3. Follow  in the same State, keyed Children follow the Model by key: a new
 *            key Invokes a Child, a key gone stops it, a key kept keeps it.
 */

type Counters = Record<string, number>;
type Keyed = { readonly key: string; readonly input?: unknown };

const SINGLE = { _tag: 'Single' } as const;

// 1. Create
export const create = (
  definition: Definition,
  id: string,
  key: string | undefined,
  input: unknown,
): Instance => {
  const init = definition.init(input);
  return enter(definition, {
    id,
    actor: definition.name,
    ...(key === undefined ? {} : { key }),
    model: init.model ?? {},
    state: init.state ?? SINGLE,
    children: {},
    invoked: {},
  });
};

// 2. Enter
export const enter = (definition: Definition, instance: Instance): Instance => {
  const slots = definition.children[instance.state._tag];
  if (!slots) return { ...instance, children: {} };
  const invocation = invocationOf(definition, instance);
  const invoked: Counters = { ...instance.invoked };
  const children: Record<string, Instance | ReadonlyArray<Instance>> = {};
  for (const [slot, { definition: child, many }] of Object.entries(slots)) {
    children[slot] = many
      ? keyedIn(invocation, slot).map(({ key, input }) =>
          invoke(child, instance.id, slot, key, input, invoked),
        )
      : invoke(child, instance.id, slot, undefined, invocation[slot], invoked);
  }
  return { ...instance, children, invoked };
};

// 3. Follow
export const follow = (
  definition: Definition,
  instance: Instance,
): Instance => {
  const slots = Object.entries(
    definition.children[instance.state._tag] ?? {},
  ).filter(([, slot]) => slot.many);
  if (slots.length === 0) return instance;
  const invocation = invocationOf(definition, instance);
  let invoked: Counters | undefined;
  let children: Record<string, Instance | ReadonlyArray<Instance>> | undefined;
  for (const [slot, { definition: child }] of slots) {
    const before = (instance.children[slot] ?? []) as ReadonlyArray<Instance>;
    const byKey = new Map(before.map((kept) => [kept.key, kept]));
    const wanted = keyedIn(invocation, slot);
    let changed = wanted.length !== before.length;
    const after = wanted.map(({ key, input }, index) => {
      const kept = byKey.get(key);
      if (kept) {
        if (before[index] !== kept) changed = true;
        return kept;
      }
      changed = true;
      invoked ??= { ...instance.invoked };
      return invoke(child, instance.id, slot, key, input, invoked);
    });
    if (changed) (children ??= { ...instance.children })[slot] = after;
  }
  return children
    ? { ...instance, children, invoked: invoked ?? instance.invoked }
    : instance;
};

const invoke = (
  definition: Definition,
  parent: string,
  slot: string,
  key: string | undefined,
  input: unknown,
  invoked: Counters,
): Instance => {
  const counter = counterOf(slot, key);
  const generation = (invoked[counter] ?? 0) + 1;
  invoked[counter] = generation;
  return create(definition, childId(parent, slot, key, generation), key, input);
};

const invocationOf = (
  definition: Definition,
  instance: Instance,
): Readonly<Record<string, unknown>> =>
  definition.invoke[instance.state._tag]?.({
    model: instance.model,
    state: instance.state,
  }) ?? {};

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
