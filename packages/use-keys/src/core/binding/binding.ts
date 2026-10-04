import type {
  KeyName,
  SequenceString,
  SequenceSteps,
  ShortcutObject,
  ShortcutString,
  Side,
} from './notation.ts';

export type {
  KeyName,
  SequenceString,
  SequenceSteps,
  ShortcutObject,
  ShortcutString,
  Side,
} from './notation.ts';

/**
 * One key going down while exactly these modifiers are down, every
 * modifier spelled out. `mod` stays `mod`: Cmd or Ctrl is decided as keys
 * are pressed, so a stored Shortcut works on every platform.
 */
export type Shortcut = {
  readonly type: 'shortcut';
  readonly key: KeyName;
  readonly mod: Side;
  readonly ctrl: Side;
  readonly alt: Side;
  readonly shift: Side;
  readonly meta: Side;
};

/** Shortcuts pressed in order: two or more. */
export type Sequence = {
  readonly type: 'sequence';
  readonly steps: ReadonlyArray<Shortcut>;
};

/** The keys of an Action, or of a useShortcut or useSequence. */
export type Binding = Shortcut | Sequence;

const MODIFIER_NAMES = ['mod', 'ctrl', 'alt', 'shift', 'meta'] as const;

const parse = (text: string): Shortcut => {
  // The key is after the last `+` that is not the key itself: `mod++`.
  const at = text.length < 2 ? -1 : text.lastIndexOf('+', text.length - 2);
  const key = text.slice(at + 1);
  const held = at === -1 ? [] : text.slice(0, at).split('+');
  const shortcut = { type: 'shortcut', key, ...NONE } as Record<
    string,
    unknown
  >;
  for (const name of held) {
    if (!(MODIFIER_NAMES as ReadonlyArray<string>).includes(name)) {
      throw new Error(`use-keys: "${text}" has no modifier "${name}".`);
    }
    shortcut[name] = true;
  }
  if (key === '' || key.includes(' ')) {
    throw new Error(`use-keys: "${text}" names no key.`);
  }
  return shortcut as Shortcut;
};

const NONE = {
  mod: false,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
} as const;

const expand = (written: ShortcutString | ShortcutObject): Shortcut =>
  typeof written === 'string'
    ? parse(written)
    : { type: 'shortcut', ...NONE, ...written };

/**
 * A Shortcut from a string, `shortcut('mod+k')`, or an object,
 * `shortcut({ key: 'k', mod: true })`: both give the same value.
 */
export const shortcut = (
  written: ShortcutString | ShortcutObject | Shortcut,
): Shortcut =>
  typeof written === 'object' && 'type' in written ? written : expand(written);

/**
 * A Sequence from a string, `sequence('g g')`, or its steps,
 * `sequence(['g', { key: 'g', shift: true }])`.
 */
export function sequence<const T extends string>(
  written: T & SequenceString<T>,
): Sequence;
export function sequence(written: SequenceSteps | Sequence): Sequence;
export function sequence(written: string | SequenceSteps | Sequence) {
  if (typeof written === 'object' && 'type' in written) return written;
  const steps =
    typeof written === 'string'
      ? written.split(' ').map(parse)
      : written.map(expand);
  if (steps.length < 2) {
    throw new Error(`use-keys: a Sequence has two steps or more.`);
  }
  return { type: 'sequence', steps } satisfies Sequence;
}

/** The steps of a Binding: one for a Shortcut. */
export const stepsOf = (binding: Binding): ReadonlyArray<Shortcut> =>
  binding.type === 'shortcut' ? [binding] : binding.steps;

const describeStep = (step: Shortcut) => {
  const held = MODIFIER_NAMES.flatMap((name) => {
    const side = step[name];
    if (side === false) return [];
    return [side === true ? name : `${name}(${side})`];
  });
  return [...held, step.key].join('+');
};

/** A Binding as people write it: `mod+k`, `g g`. */
export const describe = (binding: Binding) =>
  stepsOf(binding).map(describeStep).join(' ');

export { conflicts, exact, type Exact } from './exact.ts';
