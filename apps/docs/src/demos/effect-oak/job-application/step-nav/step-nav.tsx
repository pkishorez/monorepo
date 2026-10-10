import { STEPS, stepLabel } from '../application/index.js';
import type { Step } from '../application/index.js';

/*
 * The vertical list of steps: a marker per step (its number, a tick once
 * passed, or `!` when it needs attention) and a button to jump to it.
 * Foldkit draws it with its Tabs UI Submodel on wide screens and a Menu on
 * narrow ones; here it is plain buttons, with `aria-current` on the current
 * step.
 */

type Status = 'Current' | 'Completed' | 'Upcoming';

const statusOf = (step: Step, current: Step): Status => {
  if (step === current) return 'Current';
  return STEPS.indexOf(step) < STEPS.indexOf(current)
    ? 'Completed'
    : 'Upcoming';
};

/** Join the class names that apply. */
const cn = (...names: ReadonlyArray<string | false>) =>
  names.filter(Boolean).join(' ');

const MARKER: Record<Status, string> = {
  Current: 'bg-primary text-primary-foreground',
  Completed: 'bg-primary/15 text-primary',
  Upcoming: 'bg-muted text-muted-foreground',
};

export const StepNav = ({
  current,
  attention,
  onChoose,
}: {
  readonly current: Step;
  readonly attention: ReadonlyArray<Step>;
  readonly onChoose: (step: Step) => void;
}) => (
  <nav aria-label="Application steps" className="flex flex-col gap-0.5">
    {STEPS.map((step, index) => {
      const status = statusOf(step, current);
      const alert = attention.includes(step);
      return (
        <button
          key={step}
          type="button"
          aria-current={status === 'Current' ? 'step' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition hover:bg-muted',
            status === 'Current' && 'bg-muted',
            alert && 'text-destructive',
          )}
          onClick={() => onChoose(step)}
        >
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
              alert ? 'bg-destructive/15 text-destructive' : MARKER[status],
            )}
          >
            {alert ? '!' : status === 'Completed' ? '✓' : index + 1}
          </span>
          {stepLabel[step]}
        </button>
      );
    })}
  </nav>
);
