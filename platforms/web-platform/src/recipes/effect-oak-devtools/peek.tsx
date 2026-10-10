import { ChevronDown, ChevronUp } from '#lib/lucide';
import { Button } from '#components/ui/button';
import { KIND_LABEL, kindOf } from './step/index.ts';
import type { Inspection } from './inspection/index.ts';
import { LiveDot } from './live-dot.tsx';

/** The sheet lowered: the Step shown, ↑ ↓ through the Branch in view, and back to live. */
export const Peek = ({
  inspection,
  onOpen,
}: {
  readonly inspection: Inspection;
  readonly onOpen: () => void;
}) => {
  const { step, live } = inspection;
  const index = step === 'init' ? -1 : inspection.view.indexOf(step);
  return (
    <div className="flex min-h-0 flex-1 items-center gap-1 px-3 pb-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col text-left leading-tight"
      >
        <span className="truncate text-sm font-medium">
          {step === 'init' ? 'Init' : step.message._tag}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {KIND_LABEL[kindOf(step, inspection.around(step))]} · {index + 1} of{' '}
          {inspection.view.length}
        </span>
      </button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Previous Step"
        disabled={index < 0}
        onClick={() => inspection.move(-1)}
      >
        <ChevronDown />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Next Step"
        disabled={index + 1 >= inspection.view.length}
        onClick={() => inspection.move(1)}
      >
        <ChevronUp />
      </Button>
      {live ? (
        <span className="px-2">
          <LiveDot inspection={inspection} />
        </span>
      ) : (
        <Button size="sm" variant="secondary" onClick={inspection.goLive}>
          Live
        </Button>
      )}
    </div>
  );
};
