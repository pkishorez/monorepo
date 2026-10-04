import { useEffect, useState } from 'react';
import {
  type Sequence,
  type SequenceString,
  sequence as toSequence,
} from '../../core/binding/index.ts';
import { type Cancel, useDeclare } from '../../core/provider/index.ts';

export type SequenceOptions = {
  /** Whether it waits for its keys: true by default. */
  readonly enabled?: boolean;
  /**
   * Whether it Commits again while its last key stays down, at the Keys
   * Provider's `repeat` timing: false by default, so it Commits once.
   */
  readonly repeat?: boolean;
  /**
   * It gave up before its last step: `key` for a wrong key, `late` when a
   * step came after the Keys Provider's `sequence` timeout, `interrupted`
   * when the page lost focus.
   */
  readonly onCancel?: (reason: Cancel) => void;
};

type Pending = {
  /** True from its first step until it Commits or Cancels. */
  readonly pending: boolean;
};

/**
 * Commits when its steps are pressed in order, each within the Keys
 * Provider's `sequence` timeout of the one before, and Takes each step's
 * key. `sequence` is written as a string, `'g g'`, or is a `sequence()`
 * value, or a list of them for the same action:
 * `[sequence('g g'), sequence('g Home')]`.
 */
export function useSequence<const T extends string>(
  sequence: T & SequenceString<T>,
  onCommit: () => void,
  options?: SequenceOptions,
): Pending;
export function useSequence(
  sequence: Sequence | ReadonlyArray<Sequence>,
  onCommit: () => void,
  options?: SequenceOptions,
): Pending;
export function useSequence(
  sequence: string | Sequence | ReadonlyArray<Sequence>,
  onCommit: () => void,
  options: SequenceOptions = {},
): Pending {
  const [pending, setPending] = useState(false);
  const enabled = options.enabled !== false;
  // Turned off mid-way, it is no longer under way.
  useEffect(() => {
    if (!enabled) setPending(false);
  }, [enabled]);
  const sequences = Array.isArray(sequence)
    ? (sequence as ReadonlyArray<Sequence>)
    : [toSequence(sequence as Sequence)];
  useDeclare('useSequence', sequences, {
    enabled,
    inTextEntry: false,
    repeat: options.repeat === true,
    onCommit: () => {
      setPending(false);
      onCommit();
    },
    onPossible: () => setPending(true),
    onCancel: (reason) => {
      setPending(false);
      options.onCancel?.(reason);
    },
  });
  return { pending };
}
