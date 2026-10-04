import { useEffect, useState } from 'react';
import {
  type Cancel,
  type Step,
  useDeclare,
} from '../../core/provider/index.ts';

/** Shortcuts, or bare keys, pressed in order. */
export type Sequence = ReadonlyArray<Step>;

export type SequenceOptions = {
  /** Whether it waits for its keys: true by default. */
  readonly enabled?: boolean;
  /**
   * It gave up before its last step: `key` for a wrong key, `late` when a
   * step came after the Keys Provider's `sequence` timeout, `interrupted`
   * when the page lost focus.
   */
  readonly onCancel?: (reason: Cancel) => void;
};

/**
 * Commits when its steps are pressed in order, each within the Keys
 * Provider's `sequence` timeout of the one before, and Takes each step's
 * key. `sequence` is one Sequence, `['g', 'g']`, or a list of them for the
 * same action: `[['g', 'g'], ['Home']]`. It never Repeats.
 */
export function useSequence(
  sequence: Sequence | ReadonlyArray<Sequence>,
  onCommit: () => void,
  options: SequenceOptions = {},
): {
  /** True from its first step until it Commits or Cancels. */
  readonly pending: boolean;
} {
  const [pending, setPending] = useState(false);
  const enabled = options.enabled !== false;
  // Turned off mid-way, it is no longer under way.
  useEffect(() => {
    if (!enabled) setPending(false);
  }, [enabled]);
  const sequences = Array.isArray(sequence[0])
    ? (sequence as ReadonlyArray<Sequence>)
    : [sequence as Sequence];
  useDeclare('useSequence', sequences, {
    enabled,
    inTextEntry: false,
    repeat: false,
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
