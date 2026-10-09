import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';
import { Slider } from '@kstackz/web-platform/components/slider';

/**
 * Scrub through the app's Messages. 0 is right after init; the far right is
 * the latest Message. Dragging, stepping, or pressing ← → replays the app.
 */
export const Timeline = ({
  length,
  at,
  travel,
}: {
  readonly length: number;
  readonly at: number | null;
  readonly travel: (at: number | null) => void;
}) => {
  const shown = at ?? length;
  const step = (by: number) =>
    travel(Math.min(length, Math.max(0, shown + by)));

  return (
    <div
      className="flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === 'ArrowLeft') step(-1);
        if (event.key === 'ArrowRight') step(1);
      }}
    >
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Previous Message"
          disabled={shown === 0}
          onClick={() => step(-1)}
        >
          <ChevronLeft />
        </Button>
        <label className="mx-2 flex flex-1">
          <span className="sr-only">Timeline</span>
          <Slider
            min={0}
            max={Math.max(length, 1)}
            value={[shown]}
            aria-valuetext={
              shown === 0 ? 'Start' : `Message ${shown} of ${length}`
            }
            onValueChange={(value) =>
              travel(Array.isArray(value) ? value[0]! : (value as number))
            }
          />
        </label>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next Message"
          disabled={shown === length}
          onClick={() => step(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="flex h-7 items-center justify-between text-xs">
        <span className="text-muted-foreground tabular-nums">
          {at === null
            ? `Following live · ${length} ${length === 1 ? 'Message' : 'Messages'}`
            : at === 0
              ? `Start · before any Message`
              : `Message ${at} of ${length}`}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          to step
        </span>
      </div>
    </div>
  );
};
