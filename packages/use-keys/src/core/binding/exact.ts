import { type Modifier, MODIFIERS } from '../key/index.ts';
import type { Binding, Shortcut } from './binding.ts';
import type { Side } from './notation.ts';

export type Exact = {
  readonly key: string;
  readonly sides: Readonly<Record<Modifier, Side>>;
};

const symbol = (key: string) => key.length === 1 && !/[a-z]/.test(key);

/** A Shortcut with `mod` resolved for the platform, as keys are matched. */
export const exact = (step: Shortcut, mac: boolean): Exact => ({
  key: step.key,
  sides: {
    // A digit or symbol is the character typed, whatever Shift did.
    Shift: symbol(step.key) ? 'any' : step.shift,
    Control: !mac && step.mod !== false ? step.mod : step.ctrl,
    Alt: step.alt,
    Meta: mac && step.mod !== false ? step.mod : step.meta,
  },
});

// The states a Side allows, as none, left, right and both.
const STATES: Readonly<Record<`${Side}`, ReadonlyArray<number>>> = {
  false: [0],
  true: [1, 2, 3],
  any: [0, 1, 2, 3],
  left: [1, 3],
  right: [2, 3],
};

/** Whether one press could press both steps. */
export const overlaps = (a: Exact, b: Exact) =>
  a.key === b.key &&
  MODIFIERS.every((modifier) => {
    const states = STATES[`${b.sides[modifier]}`];
    return STATES[`${a.sides[modifier]}`].some((state) =>
      states.includes(state),
    );
  });

/**
 * Whether two Bindings Conflict on a platform: the steps of one are the
 * same as, or the start of, the steps of the other.
 */
export const conflicts = (a: Binding, b: Binding, mac: boolean) => {
  const steps = (binding: Binding) =>
    (binding.type === 'shortcut' ? [binding] : binding.steps).map((step) =>
      exact(step, mac),
    );
  const other = steps(b);
  return steps(a).every(
    (step, i) => i >= other.length || overlaps(step, other[i] as Exact),
  );
};
