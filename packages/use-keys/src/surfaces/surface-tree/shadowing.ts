import { type Binding, conflicts } from '../../core/binding/index.ts';
import type { ActionNode } from './definition.ts';

/** The Bindings of one Action that work, and why the others do not. */
export type Placed = {
  readonly works: ReadonlyArray<boolean>;
  /** Bindings that lost a Conflict at their level to the user's own. */
  readonly lost: ReadonlyArray<{
    readonly binding: Binding;
    readonly to: string;
  }>;
};

type Candidate = {
  readonly action: ActionNode;
  readonly bindings: ReadonlyArray<Binding>;
  readonly own: boolean;
};

/**
 * Places the Handled Actions of one level after the levels nearer the
 * Active Surface have claimed their keys. A Binding Conflicting with a
 * nearer one is Shadowed. At the same level the user's own come first;
 * a default that Conflicts with one of them, or one of the user's own
 * that Conflicts with an earlier one, does not work. Defaults that
 * Conflict with each other are left to the Keys Provider.
 */
export const placeLevel = (
  level: ReadonlyArray<Candidate>,
  claimed: Binding[],
  mac: boolean,
) => {
  const nearer = [...claimed];
  const mine: Array<{ binding: Binding; id: string; own: boolean }> = [];
  const placed = new Map<string, Placed>();
  const ordered = [
    ...level.filter(({ own }) => own),
    ...level.filter(({ own }) => !own),
  ];
  for (const { action, bindings, own } of ordered) {
    const lost: Array<{ binding: Binding; to: string }> = [];
    const works = bindings.map((binding) => {
      if (nearer.some((other) => conflicts(binding, other, mac))) return false;
      const rival = mine.find(
        (other) => other.own && conflicts(binding, other.binding, mac),
      );
      if (rival !== undefined) {
        lost.push({ binding, to: rival.id });
        return false;
      }
      mine.push({ binding, id: action.id, own });
      return true;
    });
    placed.set(action.id, { works, lost });
  }
  claimed.push(...mine.map(({ binding }) => binding));
  return placed;
};
