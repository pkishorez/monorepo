import type { ActorDefinition } from '../../actor/engine/index.ts';
import { Equal } from 'effect';
import { childAddress, counterOf, keyOf } from './path.ts';
import type { Address } from './path.ts';
import { isMany } from './tree.ts';
import type { Instance } from './init.ts';

/*
 * Invoke: each Child's Condition, read from the parent's data, says which
 * of its Instances exist, and the parent's data says what each is handed.
 * Pure: Instances are created by running init, never by Effects. `by` is the
 * History entry being played, `null` at init: an Instance it creates is
 * started by it, and one whose Props it changes is changed by it.
 *
 * 1. Create  an Instance runs init from its Input and enters its State. The
 *            Input, the Props, and the Model and State init gives, are
 *            checked against the Actor's Schemas.
 * 2. Enter   a State starts with none of the Children it writes; a Child
 *            written at the top lasts as long as its Instance and its
 *            Condition do.
 * 3. Follow  every Child follows the parent's data by key, the way a Worker
 *            does: a key its Condition names Invokes a Child, a key gone
 *            stops it, a key kept keeps it. A single Child with a `key` is
 *            held the same way, so a new key replaces it. Every Child kept
 *            is handed its Props again: new ones change it, and its own
 *            Children follow them in turn.
 */

type Counters = Record<string, number>;
/** What a parent hands one Child: its Input, read once by init, and its Props, read live. */
type Given = { readonly input?: unknown; readonly props?: unknown };

const SINGLE = { _tag: 'Single' } as const;

// 1. Create
export const create = (
  definition: ActorDefinition,
  address: Address,
  { input, props }: Given,
  by: number | null,
): Instance => {
  definition.check.input(input, `the Input of ${address}`);
  definition.check.props(props, `the Props of ${address}`);
  const init = definition.init(input);
  const model = init.model ?? {};
  const state = init.state ?? SINGLE;
  definition.check.model(model, `the Model init gave ${address}`);
  definition.check.state(state, `the State init gave ${address}`);
  return enter(
    definition,
    {
      address,
      actor: definition.name,
      model,
      state,
      ...(props === undefined ? {} : { props }),
      started: by,
      changed: null,
      children: {},
      invoked: {},
    },
    by,
  );
};

// 2. Enter
/**
 * Enter the Instance's State: only the Children written at the top are
 * kept, and following the parent's data Invokes the State's own fresh.
 */
export const enter = (
  definition: ActorDefinition,
  instance: Instance,
  by: number | null,
): Instance => {
  const children: Record<string, Instance | ReadonlyArray<Instance>> = {};
  for (const slot of Object.keys(
    definition.children[instance.state._tag] ?? {},
  )) {
    const kept = definition.lasting.includes(slot)
      ? instance.children[slot]
      : undefined;
    if (kept) children[slot] = kept;
  }
  return follow(definition, { ...instance, children }, by);
};

// 3. Follow
export const follow = (
  definition: ActorDefinition,
  instance: Instance,
  by: number | null,
): Instance => {
  const slots = Object.entries(definition.children[instance.state._tag] ?? {});
  if (slots.length === 0) return instance;
  const data = {
    model: instance.model,
    state: instance.state,
    props: instance.props,
  };
  let invoked: Counters | undefined;
  let children: Record<string, Instance | ReadonlyArray<Instance>> | undefined;
  for (const [
    slot,
    { definition: child, kind, keyed, keys, input, props },
  ] of slots) {
    const many = kind === 'each';
    const held = instance.children[slot];
    const before = (
      held === undefined ? [] : isMany(held) ? held : [held]
    ) as ReadonlyArray<Instance>;
    const byKey = new Map(
      before.map((kept) => [keyOf(kept.address) ?? '', kept]),
    );
    const wanted = keysOf(slot, keys(data));
    // `each` is always held, as a list even when empty.
    let changed =
      wanted.length !== before.length || (many && held === undefined);
    const after = wanted.map((key, index) => {
      const kept = byKey.get(key);
      if (kept) {
        const next = handedProps(child, kept, props(data, key), by);
        if (before[index] !== next) changed = true;
        return next;
      }
      changed = true;
      invoked ??= { ...instance.invoked };
      // A Child written in a State says so in its Address.
      const state = definition.lasting.includes(slot)
        ? undefined
        : instance.state._tag;
      const at = many || keyed ? key : undefined;
      const counter = counterOf(slot, at);
      const n = (invoked[counter] ?? 0) + 1;
      invoked[counter] = n;
      return create(
        child,
        childAddress(instance.address, state, slot, at, n),
        { input: input(data, key), props: props(data, key) },
        by,
      );
    });
    if (!changed) continue;
    children ??= { ...instance.children };
    if (many) children[slot] = after;
    else if (after[0]) children[slot] = after[0];
    else delete children[slot];
  }
  return children
    ? { ...instance, children, invoked: invoked ?? instance.invoked }
    : instance;
};

/** A Child kept, with the Props it is handed now: the same Instance while they say the same. */
const handedProps = (
  definition: ActorDefinition,
  child: Instance,
  props: unknown,
  by: number | null,
): Instance => {
  if (Equal.equals(child.props, props)) return child;
  definition.check.props(props, `the Props of ${child.address}`);
  const { props: _, ...rest } = child;
  return follow(
    definition,
    props === undefined
      ? { ...rest, changed: by }
      : { ...rest, props, changed: by },
    by,
  );
};

/** The keys a Condition names, each once. */
const keysOf = (
  slot: string,
  keys: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key))
      throw new Error(
        `[@kestack/kabuki] ${slot}: key "${key}" is Invoked twice`,
      );
    seen.add(key);
  }
  return keys;
};
