import { Schema } from 'effect';
import { bindingOf } from '@kestack/use-keys';
import type { Definition } from '@kestack/use-keys/surfaces';
import { keys, keyTable, worksWhileTyping } from '../../../../commands.ts';

/*
 * The user's own keys as Settings changes them, from the typed keys
 * definition, so an Action added there is listed here with nothing else
 * written. Bindings are each Action's keys by id, replacing all of its
 * defaults; recording gives an Action one Shortcut, and its Sequences, if
 * it has any, keep their defaults.
 */

export const Bindings = Schema.Record(
  Schema.String,
  Schema.Array(Schema.String),
);
type Bindings = typeof Bindings.Type;

/** What a recorded key would take from another Action on the same Surface. */
export const Clash = Schema.Struct({
  /** The Action recorded, and the key pressed for it. */
  id: Schema.String,
  keys: Schema.String,
  /** The Action that has that key now. */
  holder: Schema.String,
});
type Clash = typeof Clash.Type;

type Action = {
  readonly id: string;
  readonly label: string;
  readonly defaults: ReadonlyArray<string>;
  /** Whether it has a Shortcut to replace: one only Sequences press keeps them. */
  readonly recordable: boolean;
};

type Group = {
  readonly surface: string;
  readonly name: string;
  readonly actions: ReadonlyArray<Action>;
};

const isSequence = (written: string) => written.includes(' ');

const listOf = (written: string | ReadonlyArray<string>) =>
  typeof written === 'string' ? [written] : written;

// Every Surface with Actions, in the order the definition writes them.
const walk = (definition: Definition): ReadonlyArray<Group> =>
  Object.entries(definition).flatMap(
    ([surface, { label, actions, surfaces }]) => [
      ...(actions === undefined
        ? []
        : [
            {
              surface,
              name: label ?? surface,
              actions: Object.entries(actions).map(([name, action]) => {
                const defaults = listOf(action.keys);
                return {
                  id: `${surface}.${name}`,
                  label: action.label,
                  defaults,
                  recordable: defaults.some((each) => !isSequence(each)),
                };
              }),
            },
          ]),
      ...walk(surfaces ?? {}),
    ],
  );

/** Every Action of the keys definition, grouped by its Surface. */
export const groups = walk(keys.definition);

const actions = new Map(
  groups.flatMap((group) =>
    group.actions.map((action) => [action.id, { ...action, group }] as const),
  ),
);

/** An Action and its Surface, by id. */
export const actionOf = (id: string) => actions.get(id);

/** An Action's keys now: the user's own, else its defaults. */
export const keysOf = (bindings: Bindings, id: string) =>
  bindings[id] ?? actionOf(id)?.defaults ?? [];

/** Bindings with `id` given the one Shortcut `pressed`, its Sequences kept. */
export const assign = (bindings: Bindings, id: string, pressed: string) => ({
  ...bindings,
  [id]: [pressed, ...keysOf(bindings, id).filter(isSequence)],
});

/**
 * Whether `pressed` would type in a text field rather than reach `id`,
 * which works while typing: a character with no Ctrl, Alt or Cmd.
 */
export const typesInField = (id: string, pressed: string) => {
  if (!worksWhileTyping(id)) return false;
  const binding = bindingOf(pressed);
  return (
    binding.type === 'shortcut' &&
    [...binding.key].length === 1 &&
    !binding.mod &&
    !binding.ctrl &&
    !binding.alt &&
    !binding.meta
  );
};

const without = (bindings: Bindings, id: string): Bindings =>
  Object.fromEntries(Object.entries(bindings).filter(([each]) => each !== id));

/**
 * Bindings with `id` back on its defaults, and with it each Action whose
 * keys those defaults would Conflict with, and so on for the defaults
 * that brings back, as after Swaps one led to another; `also` names those,
 * in order. Defaults never Conflict, so it always ends on Bindings that
 * fit.
 */
export const reset = (
  bindings: Bindings,
  id: string,
): { readonly bindings: Bindings; readonly also: ReadonlyArray<string> } => {
  let next = without(bindings, id);
  const also: Array<string> = [];
  while (true) {
    const found = keys
      .checkBindings(next)
      .conflicts.find(
        (conflict) => conflict.id in next || conflict.with in next,
      );
    if (found === undefined) return { bindings: next, also };
    const back = found.id in next ? found.id : found.with;
    next = without(next, back);
    also.push(back);
  }
};

/** The Action on the same Surface whose keys `id`'s would Conflict with, if any. */
export const clashOf = (bindings: Bindings, id: string): Clash | null => {
  const found = keys
    .checkBindings(bindings)
    .conflicts.find((conflict) => conflict.id === id || conflict.with === id);
  if (found === undefined) return null;
  return {
    id,
    keys: found.keys,
    holder: found.id === id ? found.with : found.id,
  };
};

/**
 * Bindings with the two Actions of a Clash exchanging their keys, as they
 * were before the key was pressed; null when that would Conflict with a
 * third Action.
 */
export const swapped = (bindings: Bindings, clash: Clash): Bindings | null => {
  const next = {
    ...bindings,
    [clash.id]: keysOf(bindings, clash.holder),
    [clash.holder]: keysOf(bindings, clash.id),
  };
  return (clashOf(next, clash.id) ?? clashOf(next, clash.holder)) ? null : next;
};

/** Each Action whose keys a nearer Surface's Action has, by id: allowed, worth a note. */
export const shadowsOf = (bindings: Bindings) => {
  const notes = new Map<
    string,
    { readonly by: string; readonly keys: string }
  >();
  for (const { id, by, keys: written } of keys.checkBindings(bindings).shadowed)
    if (!notes.has(id)) notes.set(id, { by, keys: written });
  return notes;
};

/**
 * The key table's sections with only the rows whose section, label, or an
 * Action's label or keys, match `query`.
 */
export const search = (bindings: Bindings, query: string) => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return keyTable;
  return keyTable.flatMap((section) => {
    const rows = section.rows.filter((row) => {
      const text = [
        section.title,
        row.label,
        ...[...row.always, ...row.vim].flatMap((id) => [
          actionOf(id)?.label ?? '',
          ...keysOf(bindings, id),
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return rows.length === 0 ? [] : [{ ...section, rows }];
  });
};
