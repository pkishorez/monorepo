import { Button } from '#components/ui/button';

import type { SequenceController } from '../internal';

/**
 * A prebuilt Prev / Restart / Next bar wired to a {@link useSteps} controller,
 * with a "n / total" counter. Optional convenience — for custom controls, call
 * `sequence.next()` / `prev()` / `restart()` from your own buttons instead.
 */
export function StepNav({ sequence }: { sequence: SequenceController }) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        onClick={sequence.prev}
        disabled={sequence.index === 0}
      >
        Prev
      </Button>
      <Button variant="outline" onClick={sequence.restart}>
        Restart
      </Button>
      <Button
        onClick={sequence.next}
        disabled={sequence.index >= sequence.total - 1}
      >
        Next
      </Button>
      <span className="ml-2 text-sm text-muted-foreground tabular-nums">
        {sequence.index + 1} / {sequence.total}
      </span>
    </div>
  );
}
