import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, GitBranch } from 'lucide-react';
import { cn } from '../../../components/lib/utils.ts';
import { ink } from '../ink/index.ts';

/*
 * The Timeline: the bar under the Map for picking the Step shown.
 *
 * 1. Step    one step back or on.
 * 2. Track   one tick per Step on the Branch in view, init first; the one
 *            shown stands taller, and stays scrolled into view.
 * 3. Read    the Step shown: its place and its Message, once there is room.
 * 4. Branch  bring another Branch into view, when there is more than one.
 * 5. Live    back to the Head, or the sign that it is there.
 */

export interface TimelineStep {
  readonly id: string;
  readonly label: string;
}

export interface TimelineBranch {
  readonly id: string;
  readonly label: string;
}

export function Timeline({
  steps,
  shown,
  live,
  onShow,
  onLive,
  branches = [],
  branch,
  onBranch,
}: {
  /** Every Step on the Branch in view, init first. */
  readonly steps: ReadonlyArray<TimelineStep>;
  /** The place of the Step shown. */
  readonly shown: number;
  /** Showing the Head of the running app. */
  readonly live: boolean;
  readonly onShow: (index: number) => void;
  readonly onLive: () => void;
  readonly branches?: ReadonlyArray<TimelineBranch>;
  /** The Branch in view. */
  readonly branch?: string;
  readonly onBranch?: (id: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    track.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [shown]);

  const step = steps[shown];
  const last = steps.length - 1;

  return (
    <div className="bg-background/90 flex h-14 shrink-0 items-center gap-2 border-t px-2 backdrop-blur-sm @md:gap-3 @md:px-3">
      {/* 1. Step */}
      <div className="flex">
        <Press
          label="Step back"
          disabled={shown <= 0}
          onClick={() => onShow(shown - 1)}
        >
          <ChevronLeft />
        </Press>
        <Press
          label="Step on"
          disabled={shown >= last}
          onClick={() => onShow(shown + 1)}
        >
          <ChevronRight />
        </Press>
      </div>

      {/* 2. Track */}
      <div
        ref={track}
        role="list"
        aria-label="Steps"
        className="flex h-full min-w-0 flex-1 items-center gap-[3px] overflow-x-auto px-1 [scrollbar-width:none]"
      >
        {steps.map((each, index) => (
          <button
            key={each.id}
            type="button"
            role="listitem"
            title={`${index === 0 ? 'init' : `${index}. ${each.label}`}`}
            aria-label={index === 0 ? 'init' : `Step ${index}, ${each.label}`}
            aria-current={index === shown ? 'step' : undefined}
            onClick={() => onShow(index)}
            className="group grid h-8 w-2.5 shrink-0 place-items-center outline-none"
          >
            <span
              className={cn(
                'w-[3px] rounded-full transition-[height,background-color] duration-150',
                index === shown
                  ? 'h-6'
                  : 'group-hover:bg-foreground/50 h-3 group-focus-visible:h-5',
              )}
              style={{
                backgroundColor:
                  index === shown
                    ? ink('message')
                    : index < shown
                      ? ink('line-lit')
                      : ink('line'),
              }}
            />
          </button>
        ))}
      </div>

      {/* 3. Read */}
      {step && (
        <div className="hidden min-w-0 flex-col items-end leading-tight @md:flex">
          <span className="truncate text-xs font-medium">
            {shown === 0 ? 'init' : step.label}
          </span>
          <span className="text-muted-foreground text-[10.5px] tabular-nums">
            {shown} of {last}
          </span>
        </div>
      )}

      {/* 4. Branch */}
      {branches.length > 1 && onBranch && (
        <label className="text-muted-foreground hover:text-foreground relative flex h-9 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors duration-150 focus-within:ring-2">
          <GitBranch className="size-3.5" />
          <span className="sr-only">Branch in view</span>
          <select
            value={branch}
            onChange={(event) => onBranch(event.target.value)}
            className="bg-transparent outline-none"
          >
            {branches.map((each) => (
              <option key={each.id} value={each.id}>
                {each.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* 5. Live */}
      <button
        type="button"
        onClick={onLive}
        disabled={live}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-[background-color,color,scale] duration-150 outline-none focus-visible:ring-2 active:scale-[0.97]',
          live
            ? 'text-foreground cursor-default'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <span className="relative grid size-2 place-items-center">
          {live && (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden"
              style={{ backgroundColor: ink('active') }}
            />
          )}
          <span
            className="size-2 rounded-full border"
            style={
              live
                ? { backgroundColor: ink('active'), borderColor: ink('active') }
                : { borderColor: 'currentColor' }
            }
          />
        </span>
        {live ? 'Live' : 'Go live'}
      </button>
    </div>
  );
}

function Press({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-9 place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
