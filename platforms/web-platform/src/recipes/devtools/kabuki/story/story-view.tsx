import { useEffect, useMemo, useState } from 'react';
import { History } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react';
import { cn } from '#kit/class-names';
import { graphAt } from '../read/at.ts';
import { allOf } from '../read/graph.ts';
import { changesOf } from '../read/steps.ts';
import { Canvas } from '../ui/canvas.tsx';
import { Timeline } from '../ui/timeline.tsx';
import type { Moment, Story } from './story.ts';

/*
 * A Story told: the app at the moment each Scene names, drawn as Live
 * draws it, with the Scene's cards in the spotlight and the rest faint, its
 * part lit inside its card; beside the canvas, never over it, what the
 * Story answers and what each Scene says. Moving from one Scene to the
 * next moves the app from one Step to the next, so what the Step did plays
 * out on the canvas: a State's tag turning, a Child fading in.
 *
 * 1. Where   one Scene at a time, picked, or each in turn while playing,
 *            one every TICK, pausing on the last.
 * 2. Open    the cards open, by their path from the root, so they stay
 *            open from one Step to the next: each Scene opens its own, and
 *            the reader opens and closes any other.
 *
 * It only looks: the app runs on, whatever moment the Story shows.
 */

const TICK = 7000;

/** A card's path from the root, from its Instance ID: `Router/page#1/dictation#1` is `page/dictation`. */
const pathOf = (id: string) =>
  id
    .split('/')
    .slice(1)
    .map((part) => part.replace(/\[.*\]/, '').replace(/#\d+$/, ''))
    .join('/');

/** The Step a Moment names, or the last one for none; `kept` is false when the History no longer holds it. */
const stepOf = (history: History, at: Moment | undefined) => {
  const branch = history.branch();
  const last = branch.at(-1)?.id ?? null;
  if (!at) return { id: last, kept: true };
  const root = history.actor.definition;
  const entry = branch.find(
    (one) =>
      one.message._tag.split('/').at(-1) === at.message &&
      (at.to === undefined || pathOf(one.destination) === at.to) &&
      (!at.changed ||
        changesOf(
          history.snapshotAt(one.parent),
          history.snapshotAt(one.id),
          root,
        ).has(one.destination)),
  );
  if (!entry) return { id: last, kept: false };
  return { id: at.before ? entry.parent : entry.id, kept: true };
};

/** Beside the canvas: the question, then every Scene, the one shown open. */
function Narration({
  story,
  at,
  kept,
  onChoose,
}: {
  readonly story: Story;
  readonly at: number;
  readonly kept: boolean;
  readonly onChoose: (scene: number) => void;
}) {
  return (
    <aside
      aria-label="Story"
      className="flex max-h-[40%] shrink-0 flex-col border-t border-border bg-background @3xl:max-h-none @3xl:w-88 @3xl:border-t-0 @3xl:border-l"
    >
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Story
        </p>
        <h2 className="mt-1 text-sm leading-snug font-semibold text-balance">
          {story.question}
        </h2>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {story.scenes.map((scene, i) => {
          const shown = i === at;
          return (
            <li
              key={i}
              ref={(element) => {
                if (shown) element?.scrollIntoView({ block: 'nearest' });
              }}
            >
              <button
                type="button"
                aria-current={shown ? 'step' : undefined}
                onClick={() => onChoose(i)}
                className={cn(
                  'flex w-full gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  shown ? 'bg-muted/60' : 'hover:bg-muted/40',
                )}
              >
                <span
                  className={cn(
                    'mt-px w-5 shrink-0 text-right font-mono text-xs tabular-nums',
                    shown ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span
                    className={cn(
                      'text-sm leading-snug',
                      shown
                        ? 'font-medium text-foreground'
                        : i < at
                          ? 'text-muted-foreground'
                          : 'text-foreground/80',
                    )}
                  >
                    {scene.title}
                  </span>
                  {shown && (
                    <>
                      <span className="text-sm leading-6 text-pretty text-muted-foreground">
                        {scene.say}
                      </span>
                      {!kept && (
                        <span className="text-xs text-changed">
                          This moment is no longer kept: shown as the app is
                          now.
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function StoryView({
  runtime,
  story,
  dotted,
  timelineAt,
}: {
  readonly runtime: AppRuntime;
  readonly story: Story;
  readonly dotted: boolean;
  readonly timelineAt: 'top' | 'bottom';
}) {
  // A Script is its own History, played apart from the app's.
  const history = useMemo(
    () =>
      story.script
        ? History.load(runtime.history.actor, story.script, { window: null })
        : runtime.history,
    [story.script, runtime.history],
  );
  const last = story.scenes.length - 1;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opened, setOpened] = useState<ReadonlyArray<string>>(() => [
    story.scenes[0]?.card ?? '',
  ]);
  /** A Scene shown: its card opened, beside the others. */
  const choose = (scene: number) => {
    const to = Math.max(0, Math.min(last, scene));
    const card = story.scenes[to]?.card ?? '';
    setAt(to);
    setOpened((was) => [...was.filter((one) => one !== card), card]);
  };

  // 1. Where: playing moves on a Scene at a time and pauses on the last.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (at >= last) setPlaying(false);
      else choose(at + 1);
    }, TICK);
    return () => clearTimeout(timer);
  });

  const scene = story.scenes[at];
  const step = useMemo(
    () => (scene ? stepOf(history, scene.at) : undefined),
    [history, scene],
  );
  const graph = useMemo(
    () =>
      step
        ? graphAt(history, step.id, story.script ? undefined : runtime.provided)
        : undefined,
    // The Runtime's provides are read as the Step is drawn.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [history, step, story.script],
  );
  const ids = useMemo(
    () =>
      new Map(
        graph ? allOf(graph).map((node) => [pathOf(node.id), node.id]) : [],
      ),
    [graph],
  );

  if (!graph || !step || !scene)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        The app has not run yet.
      </p>
    );

  const card = ids.get(scene.card);
  const lit = [scene.card, ...(scene.with ?? [])].flatMap((path) => {
    const id = ids.get(path);
    return id === undefined ? [] : [id];
  });
  // 2. Open
  const open = opened.flatMap((path) => {
    const id = ids.get(path);
    return id === undefined ? [] : [id];
  });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col @3xl:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Canvas
            root={graph}
            opened={open}
            frame
            dotted={dotted}
            spotlight={new Set(lit)}
            {...(card
              ? {
                  bring: {
                    id: card,
                    key: `scene:${at}`,
                    with: lit.filter((id) => id !== card),
                  },
                }
              : {})}
            {...(card && scene.part
              ? { focus: { card, part: scene.part } }
              : {})}
            onOpen={(id, show) => {
              const path = pathOf(id);
              setOpened((was) =>
                show
                  ? [...was.filter((one) => one !== path), path]
                  : was.filter((one) => one !== path),
              );
            }}
          />
        </div>
        <Narration
          story={story}
          at={at}
          kept={step.kept}
          onChoose={(scene) => {
            setPlaying(false);
            choose(scene);
          }}
        />
      </div>
      <Timeline
        ticks={story.scenes.map((one, i) => ({
          id: String(i),
          label: one.title,
          tone: 'scene',
        }))}
        at={at}
        onAt={(to) => {
          setPlaying(false);
          choose(to ?? 0);
        }}
        place={timelineAt}
        playing={playing}
        onPlaying={(play) => {
          if (play && at >= last) choose(0);
          setPlaying(play);
        }}
      />
    </>
  );
}
