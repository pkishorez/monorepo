import { motion, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Slider } from '@kstackz/web-platform/components/slider';
import { seconds } from './seconds.js';

/**
 * The Steps of the app, from right after init (0) to its last Message, always
 * at the bottom. Live, it sits at the end; grabbing it or stepping back
 * switches to Replay, and ‹ › move one Message. The Time on the right is the
 * Frame's: running while live, the shown Message's Time in Replay.
 */
export const Scrubber = ({
  steps,
  shown,
  timeOf,
  frame,
  onShow,
}: {
  /** How many Messages there are: the last Step. */
  readonly steps: number;
  readonly shown: number | null;
  readonly timeOf: (step: number) => number;
  readonly frame: MotionValue<number>;
  readonly onShow: (step: number) => void;
}) => {
  const step = shown ?? steps;
  const time = useTransform(frame, seconds);

  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] sm:gap-2 sm:px-3">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Previous Message"
        disabled={step === 0}
        onClick={() => onShow(step - 1)}
      >
        <ChevronLeft />
      </Button>
      <label className="flex flex-1 items-center px-1">
        <span className="sr-only">Step</span>
        <Slider
          min={0}
          max={Math.max(steps, 1)}
          step={1}
          disabled={steps === 0}
          value={[step]}
          aria-valuetext={`Message ${step} of ${steps}, ${seconds(timeOf(step))}`}
          onValueChange={(value) =>
            onShow(Array.isArray(value) ? value[0]! : (value as number))
          }
        />
      </label>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Next Message"
        disabled={shown === null || step >= steps}
        onClick={() => onShow(step + 1)}
      >
        <ChevronRight />
      </Button>
      <span className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        <span className="max-sm:hidden">
          {step} / {steps} ·{' '}
        </span>
        <motion.span>{time}</motion.span>
      </span>
    </div>
  );
};
