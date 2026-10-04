import type { Exact, Side } from '../binding/index.ts';
import {
  isModifier,
  type Keys,
  type Modifier,
  MODIFIERS,
} from '../key/index.ts';

// Which of a modifier's sides are down: left, right, and one whose side is
// unknown, such as a modifier the browser says is down but never sent.
type Down = { left: boolean; right: boolean; unknown: boolean };

const down = (keys: Keys): Record<Modifier, Down> => {
  const state = Object.fromEntries(
    MODIFIERS.map((modifier) => [
      modifier,
      { left: false, right: false, unknown: false },
    ]),
  ) as Record<Modifier, Down>;
  for (const key of keys) {
    if (key.upAt !== null || !isModifier(key.name)) continue;
    const sides = state[key.name];
    if (key.code.endsWith('Left')) sides.left = true;
    else if (key.code.endsWith('Right')) sides.right = true;
    else sides.unknown = true;
  }
  return state;
};

const allows = (side: Side, state: Down) => {
  if (side === 'any') return true;
  if (side === 'left') return state.left;
  if (side === 'right') return state.right;
  const any = state.left || state.right || state.unknown;
  return side ? any : !any;
};

/** Whether `name` going down, with `keys` down, presses `step`. */
export const presses = (step: Exact, name: string, keys: Keys) => {
  if (step.key !== name) return false;
  const state = down(keys);
  return MODIFIERS.every((modifier) =>
    allows(step.sides[modifier], state[modifier]),
  );
};

/** Whether `step` holds Ctrl, Alt or Cmd, so it may be pressed in Text Entry. */
export const commands = (step: Exact) =>
  (['Control', 'Alt', 'Meta'] as const).some((modifier) => {
    const side = step.sides[modifier];
    return side !== false && side !== 'any';
  });
