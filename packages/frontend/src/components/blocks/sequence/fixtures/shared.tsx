import { type ReactNode, useState } from 'react';

import { Button } from '#components/ui/button';

import { Screen, step, StepNav } from '../index';
import type { Canvas, SequenceController, Step } from '../internal';

/** Selectable transition durations (seconds) shared by every demo. */
export const SPEEDS = {
  fast: 0.2,
  brisk: 0.3,
  default: 0.7,
  slow: 1,
  slower: 2,
} as const;
export type Speed = keyof typeof SPEEDS;

/** Builds a run of same-render frames named `step1…stepN` from a list of props. */
export function frames<P>(
  render: (p: P, canvas: Canvas) => ReactNode,
  list: P[],
): Step[] {
  return list.map((props, i) => step(`step${i + 1}`, props, render));
}

/**
 * In-file playground harness (NOT part of the block). Renders a controlled
 * `<Screen>` driven by a `useSteps` controller, the prebuilt `<StepNav>`, and a
 * speed selector wired to `Screen`'s `speed` prop.
 */
export function Demo({
  sequence,
  caption,
}: {
  sequence: SequenceController<any>;
  caption: string;
}) {
  const [speed, setSpeed] = useState<Speed>('default');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-background to-muted p-10">
      <Screen
        sequence={sequence}
        speed={SPEEDS[speed]}
        aspect={16 / 13}
        className="rounded-3xl border border-border bg-card/60 shadow-xl backdrop-blur"
      />
      <StepNav sequence={sequence} />
      <div className="flex items-center gap-2">
        {(Object.keys(SPEEDS) as Speed[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === speed ? 'default' : 'outline'}
            onClick={() => setSpeed(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      <p className="max-w-xl text-center text-sm text-muted-foreground">
        {caption}
      </p>
    </div>
  );
}
