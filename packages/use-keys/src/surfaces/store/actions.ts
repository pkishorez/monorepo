import {
  type Binding,
  conflicts,
  describe,
  stepsOf,
} from '../../core/binding/index.ts';
import type { FlatAction } from '../definition/index.ts';

/** An Action that does something now, with the keys it has now. */
export type Live = {
  readonly action: FlatAction;
  readonly bindings: ReadonlyArray<Binding>;
};

/** Escape alone: the Escape order decides it, never the keymap. */
export const isEscape = (binding: Binding) =>
  binding.type === 'shortcut' &&
  binding.key === 'Escape' &&
  !binding.mod &&
  !binding.ctrl &&
  !binding.alt &&
  !binding.shift &&
  !binding.meta;

/** Whether every step holds `mod`, so it climbs out of Text Entry. */
export const holdsMod = (binding: Binding) =>
  stepsOf(binding).every((step) => step.mod !== false);

/**
 * The Conflicts among live Actions: two on one Surface whose keys are the
 * same, or start the same. The one written later loses, in the order
 * given.
 */
export const conflictsOf = (live: ReadonlyArray<Live>, mac: boolean) => {
  const lost = new Set<string>();
  const messages: string[] = [];
  const keys = (each: Live) => each.bindings.map(describe).join('", "');
  live.forEach((added, index) => {
    const rival = live
      .slice(0, index)
      .find(
        (other) =>
          other.action.surface === added.action.surface &&
          !lost.has(other.action.id) &&
          other.bindings.some((theirs) =>
            added.bindings.some((mine) => conflicts(mine, theirs, mac)),
          ),
      );
    if (rival === undefined) return;
    lost.add(added.action.id);
    messages.push(
      `use-keys: "${keys(added)}" (${added.action.id}) conflicts with "${keys(rival)}" (${rival.action.id}) on the Surface "${added.action.surface}".`,
    );
  });
  return { lost, messages };
};

/** One Binding that works now, from the nearest Surface that has it. */
export type Working = {
  readonly live: Live;
  readonly index: number;
  readonly binding: Binding;
};

/**
 * Which Bindings work for the Surfaces a key climbs, nearest first: the
 * nearest one with keys that are the same, or start the same, Shadows the
 * rest. Escape alone works only on the Active Surface. `live` holds only
 * the Actions that work with Vim Mode as it is.
 */
export const resolve = (
  levels: ReadonlyArray<string>,
  live: ReadonlyArray<Live>,
  mac: boolean,
) => {
  const claimed: Binding[] = [];
  const working: Working[] = [];
  const shown: Array<{ live: Live; shadowed: boolean }> = [];
  levels.forEach((surface, depth) => {
    const found: Binding[] = [];
    for (const each of live) {
      if (each.action.surface !== surface) continue;
      let any = false;
      each.bindings.forEach((binding, index) => {
        if (isEscape(binding)) {
          any ||= depth === 0;
          return;
        }
        if (claimed.some((other) => conflicts(binding, other, mac))) return;
        any = true;
        found.push(binding);
        working.push({ live: each, index, binding });
      });
      shown.push({ live: each, shadowed: !any });
    }
    claimed.push(...found);
  });
  return { working, shown };
};
