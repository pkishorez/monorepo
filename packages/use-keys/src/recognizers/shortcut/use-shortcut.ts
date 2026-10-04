import { type Step, useDeclare } from '../../core/provider/index.ts';

export type { Shortcut } from '../../core/provider/index.ts';

export type ShortcutOptions = {
  /** Whether it waits for its keys: true by default. */
  readonly enabled?: boolean;
  /**
   * Whether it Commits again while its key stays down, at the Keys
   * Provider's `repeat` timing: false by default, so it Commits once.
   */
  readonly repeat?: boolean;
  /**
   * Whether it may Commit in Text Entry, where keys type: false by default.
   * Only a Shortcut holding Ctrl, Alt or Cmd can; plain keys always type.
   */
  readonly inTextEntry?: boolean;
};

/**
 * Commits as its key goes down while exactly its modifiers are down, and
 * Takes that key. `shortcut` is one Shortcut, a bare key for one with no
 * modifiers, or a list of either for the same action: `['j', 'ArrowDown']`.
 */
export function useShortcut(
  shortcut: Step | ReadonlyArray<Step>,
  onCommit: () => void,
  options: ShortcutOptions = {},
): void {
  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut as Step];
  useDeclare(
    'useShortcut',
    shortcuts.map((step) => [step]),
    {
      enabled: options.enabled !== false,
      inTextEntry: options.inTextEntry === true,
      repeat: options.repeat === true,
      onCommit,
    },
  );
}
