import { type Binding, conflicts, describe } from '../../core/binding/index.ts';
import { bindingsOf, type Flat } from '../definition/index.ts';
import { isEscape } from './actions.ts';
import { levelsOf } from './tree.ts';

/** What a set of Bindings would do to the keyboard, for a settings screen. */
export type BindingsCheck = {
  /**
   * Two Actions on one Surface whose keys Conflict: `id`, written later,
   * would lose its `keys` to `with`.
   */
  readonly conflicts: ReadonlyArray<{
    readonly id: string;
    readonly with: string;
    readonly surface: string;
    readonly keys: string;
  }>;
  /**
   * An Action whose `keys` do nothing wherever `by`, on a nearer Surface,
   * works: allowed, and worth a note.
   */
  readonly shadowed: ReadonlyArray<{
    readonly id: string;
    readonly by: string;
    readonly keys: string;
  }>;
  /** Bindings that name no Action, or keys that are no Shortcut or Sequence. */
  readonly invalid: ReadonlyArray<{
    readonly id: string;
    readonly reason: string;
  }>;
};

type Keyed = {
  readonly id: string;
  readonly surface: string;
  readonly bindings: ReadonlyArray<Binding>;
};

/**
 * Checks the user's own Bindings against the definition, every Action as
 * if it had a Handler, without throwing: which Actions would Conflict on
 * one Surface, and which would only be Shadowed by a nearer one. An
 * invalid Binding is reported, and its Action left out of the rest.
 */
export const checkBindings = (
  flat: Flat,
  bindings: Readonly<
    Record<string, string | ReadonlyArray<string> | undefined>
  >,
  mac: boolean,
): BindingsCheck => {
  const invalid: Array<BindingsCheck['invalid'][number]> = [];
  const custom = new Map<string, ReadonlyArray<Binding> | null>();
  for (const [id, keys] of Object.entries(bindings)) {
    if (keys === undefined) continue;
    if (!flat.actions.has(id)) {
      invalid.push({ id, reason: `"${id}" is no Action.` });
      continue;
    }
    try {
      custom.set(id, bindingsOf(keys));
    } catch (error) {
      invalid.push({ id, reason: (error as Error).message });
      custom.set(id, null);
    }
  }
  const keyed: Keyed[] = [...flat.actions.values()].flatMap((action) => {
    const own = custom.get(action.id);
    if (own === null) return [];
    return [
      {
        id: action.id,
        surface: action.surface,
        bindings: own ?? bindingsOf(action.keys),
      },
    ];
  });

  // The first of `a`'s keys that `b`'s would take, as people write it.
  const clash = (a: Keyed, b: Keyed, escape: boolean) => {
    const found = a.bindings.find(
      (mine) =>
        (escape || !isEscape(mine)) &&
        b.bindings.some((theirs) => conflicts(mine, theirs, mac)),
    );
    return found === undefined ? undefined : describe(found);
  };

  const found: Array<BindingsCheck['conflicts'][number]> = [];
  const shadowed: Array<BindingsCheck['shadowed'][number]> = [];
  keyed.forEach((later, index) => {
    for (const earlier of keyed.slice(0, index)) {
      if (earlier.surface !== later.surface) continue;
      const keys = clash(later, earlier, true);
      if (keys !== undefined) {
        found.push({
          id: later.id,
          with: earlier.id,
          surface: later.surface,
          keys,
        });
      }
    }
  });
  // A key climbs from a Surface outward, up to an Isolated one; Escape
  // alone never climbs, so it Shadows nothing.
  for (const near of keyed) {
    const above = levelsOf(flat.surfaces, near.surface).slice(1);
    for (const far of keyed) {
      if (!above.includes(far.surface)) continue;
      const keys = clash(far, near, false);
      if (keys !== undefined) shadowed.push({ id: far.id, by: near.id, keys });
    }
  }
  return { conflicts: found, shadowed, invalid };
};
