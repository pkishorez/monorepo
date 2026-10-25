import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, GitBranch } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '../../../../ui/components/kit/class-names.ts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '#components/select';
import { ink } from '../ink/index.ts';

/*
 * The Timeline: the bar over or under the Map for picking the Step shown.
 *
 * 1. Step    one step back or on, either side of the Track.
 * 2. Track   one rail for the Branch in view, init at its left end and
 *            the last Step at its right, every Step in between at its
 *            share of the way, so it never scrolls. The rail is lit up to
 *            the playhead, which stands on the Step shown and glides to
 *            the next one picked. A Fork is marked where its Branch grew.
 *            The Step nearest the pointer has its Message's name over it,
 *            and a click or tap anywhere on the rail picks it. Pressing
 *            and dragging, with a mouse or a finger, scrubs: the playhead
 *            follows the pointer smoothly, the Step shown keeps up with
 *            it, and on letting go the playhead settles on that Step. The
 *            last Step, when it is the Head, goes live. Arrow keys step it.
 * 3. Read    the live Step: its place and its Message, once there is room,
 *            in a slot of a fixed width that stays, faded, while a past
 *            Step is shown, so the Track keeps its place and its width.
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
  forks = [],
  placement = 'bottom',
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
  /** Where Forks grew from: the places of the Steps a Branch left. */
  readonly forks?: ReadonlyArray<number>;
  /** Where the bar sits: over the Map, its popovers open down; under it, up. */
  readonly placement?: 'top' | 'bottom';
}) {
  const rail = useRef<HTMLDivElement>(null);

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
  const over = placement === 'top';
  /** A Step's share of the way along the rail. */
  const shareOf = (index: number) => (last <= 0 ? 1 : index / last);
  /** The share of the rail under a point, and the Step nearest it. */
  const read = (clientX: number) => {
    const { left, width } = rail.current!.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (clientX - left) / width));
    return { share, index: Math.round(share * last) };
  };

  /** The Step nearest the pointer, to name it over the rail. */
  const [near, setNear] = useState<number>();
  /** While scrubbing, where the pointer holds the playhead. */
  const [drag, setDrag] = useState<number>();
  /** The Step a press on the rail last showed, while it drags. */
  const scrub = useRef<number | undefined>(undefined);
  const scrubTo = (clientX: number) => {
    const { share, index } = read(clientX);
    setDrag(share);
    setNear(index);
    if (index === scrub.current) return;
    scrub.current = index;
    onShow(index);
  };
  const stopScrubbing = (pointerType: string) => {
    setDrag(undefined);
    // Only a mouse stays over the rail once it lets go.
    if (pointerType !== 'mouse') setNear(undefined);
  };
  const scrubbing = drag !== undefined;
  /** Where over the bar to name the Step near the pointer: at the playhead while scrubbing. */
  const tipX = (() => {
    if (near === undefined || !rail.current || !bar.current) return 0;
    const { left, width } = rail.current.getBoundingClientRect();
    const share = scrubbing ? drag : shareOf(near);
    return left + share * width - bar.current.getBoundingClientRect().left;
  })();
  const at = drag ?? shareOf(shown);
  const glide = still
    ? { duration: 0 }
    : scrubbing
      ? { type: 'tween' as const, duration: 0.08, ease: 'linear' as const }
      : { type: 'spring' as const, stiffness: 260, damping: 32 };

  return (
    <div
      ref={bar}
      className={cn(
        'bg-background/90 relative z-10 flex h-14 shrink-0 items-center gap-2 px-2 backdrop-blur-sm @md:gap-3 @md:px-3',
        over ? 'border-b' : 'border-t',
      )}
      // Clear of a button laid over its right end, such as the Devtools Dock's.
      style={{ paddingRight: 'calc(var(--dock-reserve, 0px) + 0.75rem)' }}
    >
      <AnimatePresence>
        {near !== undefined && steps[near] && (
          <motion.div
            key="tip"
            role="tooltip"
            className={cn(
              'bg-popover text-popover-foreground pointer-events-none absolute left-0 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.1)]',
              over ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            )}
            initial={{
              opacity: 0,
              y: over ? -4 : 4,
              x: tipX,
              translateX: '-50%',
            }}
            animate={{ opacity: 1, y: 0, x: tipX, translateX: '-50%' }}
            exit={{ opacity: 0, y: over ? -4 : 4 }}
            transition={
              still
                ? { duration: 0 }
                : {
                    x: scrubbing
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 700, damping: 45 },
                    default: { duration: 0.12, ease: 'easeOut' },
                  }
            }
          >
            {nameOf(near)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. Live, while a past Step is shown: where it is, Fork, Go live */}
      <AnimatePresence>
        {!live && near === undefined && step && (
          <motion.div
            key="past"
            className={cn(
              'bg-popover text-popover-foreground absolute left-1/2 z-10 flex h-10 w-max max-w-[calc(100%-1rem)] items-center gap-1 rounded-full border p-1 pl-3.5 text-xs shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.1)]',
              over ? 'top-full mt-3' : 'bottom-full mb-3',
            )}
            initial={{ opacity: 0, y: over ? -6 : 6, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: over ? -6 : 6, x: '-50%' }}
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
        ref={rail}
        role="slider"
        tabIndex={0}
        aria-label="Steps"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={`${nameOf(shown)}, ${shown} of ${last}`}
        className="group/rail relative mx-2 flex h-full min-w-0 flex-1 cursor-pointer touch-none items-center rounded-md outline-none focus-visible:ring-2"
        onPointerDown={(event) => {
          scrub.current = undefined;
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          scrubTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (scrubbing) return scrubTo(event.clientX);
          if (event.pointerType === 'mouse') setNear(read(event.clientX).index);
        }}
        onPointerUp={(event) => stopScrubbing(event.pointerType)}
        onPointerCancel={(event) => stopScrubbing(event.pointerType)}
        onLostPointerCapture={(event) => stopScrubbing(event.pointerType)}
        onPointerLeave={() => {
          if (!scrubbing) setNear(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' && shown > 0) onShow(shown - 1);
          else if (event.key === 'ArrowRight' && shown < last)
            onShow(shown + 1);
          else return;
          event.preventDefault();
        }}
      >
        {/* The rail, and the way already come lit. */}
        <div
          className="absolute inset-x-0 h-1 rounded-full"
          style={{ backgroundColor: ink('line') }}
        />
        <motion.div
          className="absolute left-0 h-1 rounded-full"
          style={{ backgroundColor: ink('line-lit') }}
          initial={false}
          animate={{ width: `${at * 100}%` }}
          transition={glide}
        />
        {/* Where a Branch grew from. */}
        {forks.map((index) => (
          <span
            key={index}
            className="absolute -translate-x-1/2 -translate-y-[9px]"
            style={{ left: `${shareOf(index) * 100}%`, color: ink('message') }}
          >
            <GitBranch className="size-3" />
          </span>
        ))}
        {/* The playhead. */}
        <motion.div
          className="pointer-events-none absolute -translate-x-1/2"
          initial={false}
          animate={{ left: `${at * 100}%` }}
          transition={glide}
        >
          <motion.span
            className="block size-3.5 rounded-full border-2"
            style={{
              borderColor: live ? ink('active') : ink('message'),
              backgroundColor: 'var(--background)',
              boxShadow: `0 0 0 ${scrubbing ? 6 : 0}px color-mix(in oklab, ${live ? ink('active') : ink('message')} 22%, transparent)`,
              transition: 'box-shadow 160ms ease-out, border-color 160ms',
            }}
            animate={{ scale: scrubbing ? 1.25 : 1 }}
            transition={still ? { duration: 0 } : { duration: 0.16 }}
          />
        </motion.div>
      </div>

      {/* 1. Step on */}
      <Press
        label="Step on"
        disabled={shown >= last && (live || !head)}
        onClick={() => onShow(shown + 1)}
      >
        <ChevronRight />
      </Press>

      {/* 3. Read and 5. Live: one slot of a fixed width, kept while a past
          Step is shown and only faded, so the Track never moves or resizes. */}
      <div
        aria-hidden={!live}
        className={cn(
          'flex shrink-0 items-center justify-end gap-2 transition-opacity duration-150 @md:w-40',
          live ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {step && (
          <div className="hidden min-w-0 flex-1 flex-col items-end leading-tight @md:flex">
            <span className="max-w-full truncate text-xs font-medium">
              {shown === 0 ? 'init' : step.label}
            </span>
            <span className="text-muted-foreground text-[10.5px] whitespace-nowrap tabular-nums">
              {shown} of {last}
            </span>
          </div>
        )}
        <span className="flex h-9 shrink-0 items-center gap-2 px-1 text-xs font-medium @md:px-0">
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
      </div>

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
          min={0}
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
            if (Number.isInteger(typed) && typed >= 0 && typed !== window)
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
