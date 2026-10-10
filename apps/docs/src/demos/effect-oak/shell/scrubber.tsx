import { motion, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Entry } from 'effect-oak';
import { Button } from '@kstackz/web-platform/components/button';
import { Slider } from '@kstackz/web-platform/components/slider';
import { seconds } from './seconds.js';

/**
 * The entries of the Branch in view, first to last, always at the bottom.
 * Live, it sits at the end; grabbing it or stepping back switches to Replay,
 * and ‹ › move one Message. The Time on the right is the Frame's: running
 * while live, still while stopped, the shown entry's Time in Replay.
 */
export const Scrubber = ({
  branch,
  shown,
  frame,
  onShow,
}: {
  readonly branch: ReadonlyArray<Entry>;
  readonly shown: number | null;
  readonly frame: MotionValue<number>;
  readonly onShow: (entry: number) => void;
}) => {
  const last = branch.length - 1;
  const found = branch.findIndex((entry) => entry.id === shown);
  const index = shown === null || found === -1 ? last : found;
  const time = useTransform(frame, seconds);
  const showAt = (at: number) => {
    const entry = branch[Math.min(last, Math.max(0, at))];
    if (entry) onShow(entry.id);
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] sm:gap-2 sm:px-3">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Previous Message"
        disabled={index <= 0}
        onClick={() => showAt(index - 1)}
      >
        <ChevronLeft />
      </Button>
      <label className="flex flex-1 items-center px-1">
        <span className="sr-only">Message</span>
        <Slider
          min={0}
          max={Math.max(last, 1)}
          step={1}
          disabled={branch.length === 0}
          value={[Math.max(index, 0)]}
          aria-valuetext={`Message ${index + 1} of ${branch.length}, ${seconds(branch[index]?.at ?? 0)}`}
          onValueChange={(value) =>
            showAt(Array.isArray(value) ? value[0]! : (value as number))
          }
        />
      </label>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Next Message"
        disabled={shown === null || index >= last}
        onClick={() => showAt(index + 1)}
      >
        <ChevronRight />
      </Button>
      <span className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        <span className="max-sm:hidden">
          {index + 1} / {branch.length} ·{' '}
        </span>
        <motion.span>{time}</motion.span>
      </span>
    </div>
  );
};
