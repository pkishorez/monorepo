import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppRuntime } from '@kestack/kabuki/react';
import { GitBranchIcon } from 'lucide-react';
import { cn } from '#kit/class-names';
import { graphAt } from '../read/at.ts';
import { Canvas } from '../ui/canvas.tsx';
import { Timeline, type Tick, type Tone } from '../ui/timeline.tsx';

/*
 * Live: the app at any Step of its History, on the canvas, over the
 * timeline of every Step. Each card the Step changed is marked.
 *
 * 1. Step     the newest as it comes; one picked on the timeline; or each
 *             in turn while playing, one every TICK, back to live at the
 *             last.
 * 2. Travel   with Travel the app on, the Step shown is the app's own: a
 *             Step picked Time Travels the app, which stays read only until
 *             it goes live again, and Fork carries on from it on a new
 *             Branch. Off, only the Devtools look back; the app runs on.
 * 3. Opened   the cards open, as many as the reader opened, by Instance.
 *             A Step looked back at opens the card its Message was for,
 *             unfolds the way down to it and brings it into view; moving
 *             on closes it again, unless the reader opened it, and the
 *             reader closing it keeps it closed for that Step.
 */

const TICK = 1400;

const short = (id: string) => id.split('/').at(-1) ?? id;

/** What came of a Step's Message: a rule took it, or none did, its Instance there or gone. */
const outcomeOf = (
  outcome: 'handled' | 'ignored' | 'dropped',
): { readonly tone: Tone; readonly said: string } =>
  outcome === 'handled'
    ? { tone: 'took', said: '' }
    : outcome === 'ignored'
      ? { tone: 'ignored', said: ' · no rule took it' }
      : { tone: 'ignored', said: ' · its Instance was gone' };

/** Picked, not live: the History entry shown. */
type At = number | null;

/** A quiet switch beside the timeline: what more the Devtools do. */
function Switch({
  on,
  onChange,
  name,
  children,
}: {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  /** What it is called whatever its width shows. */
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      onClick={() => onChange(!on)}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11',
        on
          ? 'border-foreground/20 bg-muted font-medium text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function Live({
  runtime,
  travel,
  onTravel,
  dotted,
  timelineAt,
}: {
  readonly runtime: AppRuntime;
  readonly travel: boolean;
  readonly onTravel: (travel: boolean) => void;
  readonly dotted: boolean;
  readonly timelineAt: 'top' | 'bottom';
}) {
  const { history } = runtime;
  const steps = runtime.branch;
  const [own, setOwn] = useState<At>(null);
  const [playing, setPlaying] = useState(false);
  const [opened, setOpened] = useState<ReadonlyArray<string>>([]);

  // 2. Travel: the app's own Step, or the Devtools' own.
  const shown =
    runtime.shown === 'init' ? null : travel ? (runtime.shown ?? null) : own;
  const at = (to: At) => {
    if (travel) runtime.show(to);
    else setOwn(to);
  };
  const index =
    shown === null
      ? steps.length - 1
      : steps.findIndex(({ id }) => id === shown);
  const step = steps[index];
  const scrubbing = shown !== null;

  // 3. Opened: the reader's, and the card the Step looked back at was for.
  const [closed, setClosed] = useState<number | null>(null);
  const followed =
    scrubbing && step && closed !== step.id ? step.destination : undefined;
  const open = [
    ...opened.filter((one) => one !== followed),
    ...(followed ? [followed] : []),
  ];

  // 1. Step: playing moves on one Step at a time, live again at the last.
  // One timer per Step shown, so a busy app drawing again never resets it.
  const latest = useRef({ steps, index, at });
  latest.current = { steps, index, at };
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      const { steps: all, index: from, at: go } = latest.current;
      const next = all[from + 1];
      if (next && from + 1 < all.length - 1) go(next.id);
      else {
        go(null);
        setPlaying(false);
      }
    }, TICK);
    return () => clearTimeout(timer);
  }, [playing, index]);

  const graph = useMemo(
    () => graphAt(history, step?.id ?? null, runtime.provided),
    // The Runtime's provides are read as the Step is drawn.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [history, step],
  );

  if (!graph)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This Step is no longer kept.
      </p>
    );

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Canvas
          root={graph}
          opened={open}
          frame
          dotted={dotted}
          {...(followed && step
            ? { bring: { id: followed, key: `step:${step.id}`, with: [] } }
            : {})}
          onOpen={(id, show) => {
            if (!show && id === followed && step) setClosed(step.id);
            setOpened((was) =>
              show
                ? [...was.filter((one) => one !== id), id]
                : was.filter((one) => one !== id),
            );
          }}
        />
      </div>
      <Timeline
        ticks={steps.map((one): Tick => {
          const { tone, said } = outcomeOf(history.outcome(one.id));
          return {
            id: String(one.id),
            label: `${one.message._tag.split('/').at(-1)} → ${short(one.destination)}${said}`,
            tone,
          };
        })}
        at={scrubbing ? index : null}
        onAt={(to) => at(to === null ? null : (steps[to]?.id ?? null))}
        playing={playing}
        onPlaying={(play) => {
          // From the first Step when live: live has nothing after it to play.
          if (play && !scrubbing && steps[0]) at(steps[0].id);
          setPlaying(play);
        }}
        live={{ shown: !scrubbing }}
        place={timelineAt}
        extra={
          <>
            {travel && scrubbing && (
              <button
                type="button"
                title="Carry on from this Step, on a new Branch"
                onClick={() => {
                  setPlaying(false);
                  runtime.start(shown);
                  runtime.show(null);
                }}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11"
              >
                <GitBranchIcon aria-hidden className="size-3.5" />
                Fork
              </button>
            )}
            <Switch
              name="Travel the app"
              on={travel}
              onChange={(next) => {
                // The Step shown stays shown, whoever holds it now.
                if (next) {
                  if (own !== null) runtime.show(own);
                } else {
                  setOwn(shown);
                  runtime.show(null);
                }
                onTravel(next);
              }}
            >
              <span className="@xl:hidden">Travel</span>
              <span className="hidden @xl:inline">Travel the app</span>
            </Switch>
          </>
        }
      />
    </>
  );
}

/**
 * Only the canvas, for a talk or a recording: the Step the app shows, the
 * whole tree kept in view as it changes, nothing to press.
 */
export function Presenting({
  runtime,
  dotted,
}: {
  readonly runtime: AppRuntime;
  readonly dotted: boolean;
}) {
  const shown =
    typeof runtime.shown === 'number'
      ? runtime.shown
      : runtime.shown === 'init'
        ? null
        : (runtime.branch.at(-1)?.id ?? null);
  const graph = useMemo(
    () => graphAt(runtime.history, shown, runtime.provided),
    // The Runtime's provides are read as the Step is drawn.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [runtime.history, shown],
  );
  if (!graph) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Canvas
        root={graph}
        opened={[]}
        frame
        follow
        dotted={dotted}
        onOpen={() => {}}
      />
    </div>
  );
}
