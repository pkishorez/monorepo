import { ChevronDown, ChevronUp } from '#lib/lucide';
import { Button } from '#components/ui/button';

/**
 * Where the Step shown is on the Branch in view, at the top right of the
 * canvas, and ↑ ↓ to move along it. The Step itself is told below.
 */
export const StepBar = ({
  index,
  total,
  onMove,
}: {
  readonly index: number;
  readonly total: number;
  readonly onMove: (by: -1 | 1) => void;
}) => (
  <div className="absolute top-3 right-3 flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 pl-2.5 shadow-sm backdrop-blur">
    <span className="pr-1 text-[11px] text-muted-foreground tabular-nums">
      {index < 0 ? 'Init' : `${index + 1} of ${total}`}
    </span>
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Previous Step"
      title="Previous Step (↓)"
      disabled={index < 0}
      onClick={() => onMove(-1)}
    >
      <ChevronDown />
    </Button>
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Next Step"
      title="Next Step (↑)"
      disabled={index + 1 >= total}
      onClick={() => onMove(1)}
    >
      <ChevronUp />
    </Button>
  </div>
);
