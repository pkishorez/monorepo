import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, GitBranch } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '../../../components/lib/utils.ts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { ink } from '../ink/index.ts';

/*
 * The Timeline: the bar under the Map for picking the Step shown.
 *
 * 1. Step    one step back or on, either side of the Track.
 * 2. Track   one tick per Step on the Branch in view, init first; the one
 *            shown stands taller. When they do not all fit, the row glides
 *            to keep the one shown in the middle, stopping at either end,
 *            and live it rests at its right end; a finger or a trackpad
 *            can still swipe it. The tick nearest the pointer rises with
 *            its Message's name over it, and a click or tap anywhere on the
 *            track picks the nearest. The last tick, when it is the Head,
 *            goes live.
 * 3. Read    the live Step: its place and its Message, once there is room.
 * 4. Branch  bring another Branch into view, when there is more than one
 *            and there is room.
 * 5. Live    the sign that it is live; or, while a past Step is shown, a
 *            pill over the bar with that Step, Fork here, which grows a
 *            new Branch from it, and Go live. The bar below stays only the
 *            Track, so it fits a phone. The pill steps aside while the
 *            pointer reads the Track.
 * 6. Window  how many entries the History keeps: a preset, or any number
 *            typed in, set on Enter or blur. A smaller one Compacts at once,
 *            and cannot be undone. 1 keeps only the Snapshot; 2 is the least
 *            that still shows a change.
 */

const PRESETS = [1, 2, 5, 10, 25, 50, 100, 500];
const HINTS: Partial<Record<number, string>> = {
  1: 'Snapshot only',
  2: 'last change',
};

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
  onShow: showStep,
  onLive,
  onFork,
  head = false,
  branches = [],
  branch,
  onBranch,
  window,
  onWindow,
}: {
  /** Every Step on the Branch in view, init first. */
  readonly steps: ReadonlyArray<TimelineStep>;
  /** The place of the Step shown. */
  readonly shown: number;
  /** Showing the Head of the running app. */
  readonly live: boolean;
  readonly onShow: (index: number) => void;
  readonly onLive: () => void;
  /** Go live from the Step shown, growing a new Branch from it. */
  readonly onFork?: () => void;
  /** The last Step is the Head: picking it goes live. */
  readonly head?: boolean;
  readonly branches?: ReadonlyArray<TimelineBranch>;
  /** The Branch in view. */
  readonly branch?: string;
  readonly onBranch?: (id: string) => void;
  /** How many entries the History keeps on the Head's Branch, `null` for every one. */
  readonly window?: number | null;
  readonly onWindow?: (window: number | null) => void;
}) {
  const track = useRef<HTMLDivElement>(null);

  const step = steps[shown];
  const last = steps.length - 1;
  const onShow = (index: number) =>
    head && index === last ? onLive() : showStep(index);
  const nameOf = (index: number) =>
    index === 0
      ? 'init'
      : head && index === last && !live
        ? `${steps[index]!.label} · go live`
        : steps[index]!.label;

  const bar = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const [near, setNear] = useState<{ index: number; x: number }>();
  /** The tick nearest the pointer, gaps included, and its middle in the bar. */
  /** The tick nearest a point across the track, gaps included. */
  const nearestTo = (clientX: number) => {
    const ticks = [...track.current!.children];
    let index = 0;
    let best = Infinity;
    ticks.forEach((tick, at) => {
      const { left, width } = tick.getBoundingClientRect();
      const off = Math.abs(left + width / 2 - clientX);
      if (off < best) [index, best] = [at, off];
    });
    return index;
  };
  /** Where the mouse is over the track, to follow it as the row glides. */
  const pointer = useRef<number | undefined>(undefined);
  const point = () => {
    if (pointer.current === undefined) return;
    const index = nearestTo(pointer.current);
    const { left, width } =
      track.current!.children[index]!.getBoundingClientRect();
    const x = left + width / 2 - bar.current!.getBoundingClientRect().left;
    setNear((was) =>
      was?.index === index && was.x === x ? was : { index, x },
    );
  };

  // The Step shown in the middle of the track, or as near as its ends allow.
  useEffect(() => {
    const at = track.current;
    const tick = at?.children[shown] as HTMLElement | undefined;
    if (!at || !tick) return;
    at.scrollTo({
      left: tick.offsetLeft + tick.offsetWidth / 2 - at.clientWidth / 2,
      behavior: still ? 'instant' : 'smooth',
    });
  }, [shown, steps.length, still]);

  return (
    <div
      ref={bar}
      className="bg-background/90 relative flex h-14 shrink-0 items-center gap-2 border-t px-2 backdrop-blur-sm @md:gap-3 @md:px-3"
      // Clear of a button laid over its right end, such as the Devtools Dock's.
      style={{ paddingRight: 'calc(var(--dock-reserve, 0px) + 0.75rem)' }}
    >
      <AnimatePresence>
        {near && steps[near.index] && (
          <motion.div
            key="tip"
            role="tooltip"
            className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-0 mb-1.5 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.1)]"
            initial={{ opacity: 0, y: 4, x: near.x, translateX: '-50%' }}
            animate={{ opacity: 1, y: 0, x: near.x, translateX: '-50%' }}
            exit={{ opacity: 0, y: 4 }}
            transition={
              still
                ? { duration: 0 }
                : {
                    x: { type: 'spring', stiffness: 700, damping: 45 },
                    default: { duration: 0.12, ease: 'easeOut' },
                  }
            }
          >
            {nameOf(near.index)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. Live, while a past Step is shown: where it is, Fork, Go live */}
      <AnimatePresence>
        {!live && !near && step && (
          <motion.div
            key="past"
            className="bg-popover text-popover-foreground absolute bottom-full left-1/2 mb-3 flex h-10 w-max max-w-[calc(100%-1rem)] items-center gap-1 rounded-full border p-1 pl-3.5 text-xs shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.1)]"
            initial={{ opacity: 0, y: 6, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 6, x: '-50%' }}
            transition={
              still ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }
            }
          >
            <span className="mr-1.5 flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
              <span className="truncate font-medium">
                {shown === 0 ? 'init' : step.label}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {shown} of {last}
              </span>
            </span>
            {onFork && (
              <button
                type="button"
                onClick={onFork}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium transition-[background-color,color,scale] duration-150 outline-none focus-visible:ring-2 active:scale-[0.97]"
              >
                <GitBranch className="size-3.5" />
                Fork here
              </button>
            )}
            <button
              type="button"
              onClick={onLive}
              className="bg-foreground text-background flex h-8 shrink-0 items-center gap-2 rounded-full px-3 font-medium transition-[opacity,scale] duration-150 outline-none hover:opacity-90 focus-visible:ring-2 active:scale-[0.97]"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: ink('active') }}
              />
              Go live
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Step back */}
      <Press
        label="Step back"
        disabled={shown <= 0}
        onClick={() => onShow(shown - 1)}
      >
        <ChevronLeft />
      </Press>

      {/* 2. Track */}
      <div
        ref={track}
        role="list"
        aria-label="Steps"
        className="relative flex h-full min-w-0 flex-1 touch-pan-x items-center gap-[3px] overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none]"
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          pointer.current = event.clientX;
          point();
        }}
        onPointerLeave={() => {
          pointer.current = undefined;
          setNear(undefined);
        }}
        onScroll={point}
        onClick={(event) => {
          if (event.target === event.currentTarget)
            onShow(nearestTo(event.clientX));
        }}
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
                'w-[3px] rounded-full transition-[height,background-color] duration-150 ease-out',
                index === shown
                  ? 'h-6'
                  : index === near?.index
                    ? 'h-5'
                    : 'h-3 group-focus-visible:h-5',
              )}
              style={{
                backgroundColor:
                  index === shown
                    ? ink('message')
                    : index === near?.index
                      ? 'var(--foreground)'
                      : index < shown
                        ? ink('line-lit')
                        : ink('line'),
              }}
            />
          </button>
        ))}
      </div>

      {/* 1. Step on */}
      <Press
        label="Step on"
        disabled={shown >= last && (live || !head)}
        onClick={() => onShow(shown + 1)}
      >
        <ChevronRight />
      </Press>

      {/* 3. Read, live; a past Step is read above */}
      {live && step && (
        <div className="hidden min-w-0 flex-col items-end leading-tight @md:flex">
          <span className="truncate text-xs font-medium">
            {shown === 0 ? 'init' : step.label}
          </span>
          <span className="text-muted-foreground text-[10.5px] whitespace-nowrap tabular-nums">
            {shown} of {last}
          </span>
        </div>
      )}

      {/* 4. Branch */}
      {branches.length > 1 && onBranch && (
        <label className="text-muted-foreground hover:text-foreground relative hidden h-9 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors duration-150 focus-within:ring-2 @md:flex">
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

      {/* 5. Live, the sign that it is there */}
      {live && (
        <span className="flex h-9 shrink-0 items-center gap-2 px-1 text-xs font-medium @md:px-2">
          <span className="relative grid size-2 place-items-center">
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden"
              style={{ backgroundColor: ink('active') }}
            />
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: ink('active') }}
            />
          </span>
          <span className="hidden @md:inline">Live</span>
          <span className="sr-only @md:hidden">Live</span>
        </span>
      )}

      {/* 6. Window */}
      {onWindow && <WindowPicker window={window ?? null} onWindow={onWindow} />}
    </div>
  );
}

function WindowPicker({
  window,
  onWindow,
}: {
  readonly window: number | null;
  readonly onWindow: (window: number | null) => void;
}) {
  const [typing, setTyping] = useState(false);

  if (typing)
    return (
      <label className="text-muted-foreground focus-within:text-foreground hidden h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs focus-within:ring-2 @md:flex">
        <span>Keep</span>
        <input
          autoFocus
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          defaultValue={window ?? ''}
          aria-label="Entries the History keeps"
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setTyping(false);
          }}
          onBlur={(event) => {
            const typed = event.currentTarget.valueAsNumber;
            if (Number.isInteger(typed) && typed >= 1 && typed !== window)
              onWindow(typed);
            setTyping(false);
          }}
          className="text-foreground w-14 bg-transparent text-base tabular-nums outline-none @md:text-xs"
        />
      </label>
    );

  const sizes =
    window === null || PRESETS.includes(window)
      ? PRESETS
      : [...PRESETS, window].sort((a, b) => a - b);
  const items = {
    all: 'all',
    ...Object.fromEntries(sizes.map((each) => [`${each}`, `${each}`])),
    custom: 'Custom…',
  };
  return (
    <Select
      items={items}
      value={window === null ? 'all' : `${window}`}
      onValueChange={(value) => {
        if (value === 'custom') setTyping(true);
        else if (value) onWindow(value === 'all' ? null : Number(value));
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Entries the History keeps"
        className="hidden text-xs @md:flex"
      >
        <span className="text-muted-foreground">Keep</span>
        <SelectValue className="tabular-nums" />
      </SelectTrigger>
      <SelectContent className="min-w-44">
        <SelectItem value="all">
          all <Hint>unbounded</Hint>
        </SelectItem>
        {sizes.map((each) => (
          <SelectItem key={each} value={`${each}`} className="tabular-nums">
            {each}
            {HINTS[each] && <Hint>{HINTS[each]}</Hint>}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="custom">Custom…</SelectItem>
      </SelectContent>
    </Select>
  );
}

function Hint({ children }: { readonly children: ReactNode }) {
  return (
    <span className="text-muted-foreground ml-auto text-xs">{children}</span>
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
