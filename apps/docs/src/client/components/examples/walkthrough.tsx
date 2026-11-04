import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { ENTER, EXIT, FlashAccent } from './picture.tsx';

/*
 * A picture told as a walkthrough, one step at a time. Above the drawing,
 * a strip says which step this is and what it shows, in one plain
 * sentence. Each step's change happens first, then holds long enough to
 * read its sentence: the longer the sentence, the longer the hold. A row
 * of segments, one per step, fills as each step plays; pressing one goes
 * to that step and stays there, and play carries on from it. Every
 * sentence sits in one grid cell, the hidden ones holding the strip as
 * tall as the longest, so a step never moves the page. It waits while off
 * screen or in a hidden tab. A reader who asks for less motion starts at
 * step 1, paused, and steps through by hand; nothing slides.
 */

/** Time for a step's change to happen, before its hold starts. */
const CHANGE_MS = 400;
/** The least a step holds, and the time it adds for each word to read. */
const HOLD_MS = 1200;
const WORD_MS = 60;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** How long a step plays: its change, then time to read what it says. */
export const lengthOf = (caption: string) =>
  CHANGE_MS + HOLD_MS + WORD_MS * words(caption);

/** A walkthrough's state, made by `useWalkthrough`, drawn by `Walkthrough`. */
export type Walk = {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly captions: ReadonlyArray<string>;
  /** The step shown, from 0. */
  readonly step: number;
  /** How many times it has gone back to the start: keys that replay use it. */
  readonly round: number;
  /** Whether the reader wants it to play. */
  readonly playing: boolean;
  /** Whether it is playing now: wanted, on screen and in a shown tab. */
  readonly running: boolean;
  readonly go: (step: number) => void;
  readonly toggle: () => void;
  readonly replay: () => void;
};

/**
 * Steps through a picture, one per caption, each held for `lengthOf` its
 * caption. Hand the result to `Walkthrough`, around the drawing.
 */
export function useWalkthrough(captions: ReadonlyArray<string>): Walk {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ step: 0, round: 0 });
  const [playing, setPlaying] = useState(true);
  const [seen, setSeen] = useState(false);

  // An observer, a media query and the tab's visibility: the page around
  // React, given back on unmount.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches)
      setPlaying(false);
    let onScreen = false;
    const update = () =>
      setSeen(onScreen && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const running = playing && seen;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () =>
        setAt((previous) => {
          const step = (previous.step + 1) % captions.length;
          return {
            step,
            round: step === 0 ? previous.round + 1 : previous.round,
          };
        }),
      lengthOf(captions[at.step] ?? ''),
    );
    return () => clearTimeout(timer);
  }, [running, at, captions]);

  return {
    ref,
    captions,
    step: at.step,
    round: at.round,
    playing,
    running,
    go: (step) => {
      setPlaying(false);
      setAt((previous) => ({ step, round: previous.round }));
    },
    toggle: () => setPlaying((was) => !was),
    replay: () => {
      setPlaying(true);
      setAt((previous) => ({ step: 0, round: previous.round + 1 }));
    },
  };
}

const cell = '[grid-area:1/1]';
const quiet =
  'text-muted-foreground hover:text-foreground pointer-coarse:size-11';

/**
 * A walkthrough's frame: the strip with the step, its sentence and the
 * controls, then the drawing under it. Inside, a `Flash` lights in the
 * accent, and with less motion asked for, nothing slides.
 */
export function Walkthrough({
  walk,
  children,
}: {
  readonly walk: Walk;
  readonly children: ReactNode;
}) {
  const { captions, step, round, playing, running } = walk;
  return (
    <MotionConfig reducedMotion="user">
      <FlashAccent value>
        <div ref={walk.ref} className="motion-reduce:[&_*]:transition-none">
          <div className="border-b border-border/60 px-4 pt-1.5 pb-3 sm:px-5">
            <div className="flex items-center gap-1">
              <ol className="flex min-w-0 flex-1 gap-1">
                {captions.map((caption, index) => (
                  <li key={index} className="flex min-w-6 flex-1">
                    <button
                      type="button"
                      aria-label={`Step ${index + 1}: ${caption}`}
                      {...(index === step
                        ? { 'aria-current': 'step' as const }
                        : {})}
                      onClick={() => walk.go(index)}
                      className="group flex h-6 w-full cursor-pointer items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring pointer-coarse:h-11"
                    >
                      <span className="relative h-1 w-full overflow-hidden rounded-full bg-border transition-colors duration-150 group-hover:bg-muted-foreground/40">
                        {index < step && (
                          <span className="absolute inset-0 bg-foreground/35" />
                        )}
                        {index === step && (
                          <motion.span
                            key={`${round}-${step}-${running}`}
                            className="absolute inset-0 origin-left bg-foreground/60"
                            initial={running ? { scaleX: 0 } : false}
                            animate={{ scaleX: 1 }}
                            transition={{
                              duration: lengthOf(caption) / 1000,
                              ease: 'linear',
                            }}
                          />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={playing ? 'Pause' : 'Play'}
                title={playing ? 'Pause' : 'Play'}
                onClick={walk.toggle}
                className={quiet}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Play again from the start"
                title="Play again"
                onClick={walk.replay}
                className={`-mr-2 ${quiet}`}
              >
                <RotateCcwIcon />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              Step {step + 1} of {captions.length}
            </p>
            <div className="mt-1 grid text-sm leading-6 text-pretty text-foreground">
              {captions.map((caption, index) => (
                <p key={index} aria-hidden className={`${cell} invisible`}>
                  {caption}
                </p>
              ))}
              <AnimatePresence initial={false}>
                <motion.p
                  key={step}
                  className={cell}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: ENTER }}
                  exit={{ opacity: 0, y: -4, transition: EXIT }}
                >
                  {captions[step]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
          {children}
        </div>
      </FlashAccent>
    </MotionConfig>
  );
}
