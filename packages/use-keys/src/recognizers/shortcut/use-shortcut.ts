import {
  shortcut as toShortcut,
  type Shortcut,
  type ShortcutObject,
  type ShortcutString,
} from '../../core/binding/index.ts';
import { useDeclare } from '../../core/provider/index.ts';

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
 * Takes that key. `shortcut` is written as a string, `'mod+k'`, or an
 * object, `{ key: 'k', mod: true }`, or is a list of `shortcut()` values
 * for the same action: `[shortcut('j'), shortcut('ArrowDown')]`.
 */
export function useShortcut(
  shortcut:
    | ShortcutString
    | ShortcutObject
    | Shortcut
    | ReadonlyArray<Shortcut>,
  onCommit: () => void,
  options: ShortcutOptions = {},
): void {
  const shortcuts = Array.isArray(shortcut)
    ? (shortcut as ReadonlyArray<Shortcut>)
    : [toShortcut(shortcut as ShortcutString | ShortcutObject | Shortcut)];
  useDeclare('useShortcut', shortcuts, {
    enabled: options.enabled !== false,
    inTextEntry: options.inTextEntry === true,
    repeat: options.repeat === true,
    onCommit,
  });
}
