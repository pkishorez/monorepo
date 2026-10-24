import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { AppRuntime } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCcwIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { carryOn, showStep, stepOf } from './steps.ts';

/*
 * Every step of the app on one track, like a video's: the left end is the
 * app right after init, the right end is now, and a tick marks each
 * Message between. Press anywhere on it and drag, with a mouse or a
 * finger, and the app shows the step nearest the pointer, its Message
 * named above the thumb; drag to the right end and it is live again. The
 * arrows and arrow keys move one step. While a past step is shown, Live
 * goes back to now, and Carry on goes live from there, growing a new
 * Branch. Dragging sideways scrubs; dragging up and down still scrolls
 * the page.
 */

/** Past this many Messages the ticks would touch, so the track has none. */
const MOST_TICKS = 60;

export function Timeline({ runtime }: { readonly runtime: AppRuntime }) {
  const { branch, shown } = runtime;
  const at = stepOf(runtime);
  const last = branch.length;
  const live = shown === null;
  const rail = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const go = (step: number) =>
    showStep(runtime, Math.max(0, Math.min(step, last)));
  const percent = (step: number) => (last === 0 ? 0 : (step / last) * 100);
  const nameOf = (step: number) =>
    step === 0 ? 'init' : branch[step - 1]!.message._tag;

  /** Shows the step nearest the pointer, if it is not the one shown. */
  const scrub = (event: PointerEvent) => {
    const box = rail.current?.getBoundingClientRect();
    if (!box || last === 0) return;
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - box.left) / box.width),
    );
    const step = Math.round(fraction * last);
    if (step !== at) go(step);
  };
  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (last === 0 || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    setDragging(true);
    scrub(event);
  };
  const keys = (event: KeyboardEvent) => {
    const step =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? at - 1
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? at + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (step === undefined) return;
    event.preventDefault();
    go(step);
  };
  const message = nameOf(at);

  return (
    <div
      role="group"
      aria-label="Timeline"
      className="border-t border-border bg-background px-2 pt-1.5 pb-2"
    >
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Step back"
          disabled={at === 0}
          onClick={() => go(at - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <div
          role="slider"
          tabIndex={last === 0 ? -1 : 0}
          aria-label="Step"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={at}
          aria-valuetext={`Step ${at} of ${last}: ${message}`}
          aria-disabled={last === 0}
          onKeyDown={keys}
          onPointerDown={press}
          onPointerMove={(event) => dragging && scrub(event)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className={`group relative h-10 min-w-0 flex-1 touch-pan-y px-2 select-none focus-visible:outline-none ${
            last === 0 ? 'opacity-50' : 'cursor-pointer'
          }`}
        >
          <div ref={rail} className="relative h-full">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-border transition-[height] group-hover:h-1.5">
              <div
                className="h-full bg-foreground/60"
                style={{ width: `${percent(at)}%` }}
              />
            </div>
            {last <= MOST_TICKS &&
              branch.map((entry, index) => (
                <span
                  key={entry.id}
                  aria-hidden
                  className="absolute top-1/2 size-1 -translate-1/2 rounded-full bg-background"
                  style={{ left: `${percent(index + 1)}%` }}
                />
              ))}
            <span
              aria-hidden
              className={`absolute top-1/2 -translate-1/2 rounded-full bg-foreground ring-foreground/15 group-focus-visible:ring-4 ${
                dragging ? 'size-4 ring-4' : 'size-3 transition-[left]'
              }`}
              style={{ left: `${percent(at)}%` }}
            />
            {dragging && (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-[calc(50%+0.75rem)] -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-background"
                style={{ left: `${percent(at)}%` }}
              >
                {message}
              </span>
            )}
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Step forward"
          disabled={at === last}
          onClick={() => go(at + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="flex min-h-8 items-center gap-2 px-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">
            {at}/{last}
          </span>{' '}
          <span className="text-foreground">{message}</span>
        </p>
        {live ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={last === 0}
            onClick={runtime.clear}
          >
            <RotateCcwIcon />
            Start over
          </Button>
        ) : (
          <>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => carryOn(runtime, at)}
            >
              Carry on from here
            </Button>
            <Button size="xs" onClick={() => runtime.show(null)}>
              Live
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
