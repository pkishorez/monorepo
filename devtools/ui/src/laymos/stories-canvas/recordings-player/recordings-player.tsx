import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import type { PhaseReport, Recording, Step } from 'laymos/story/schema';

import {
  keepsKeys,
  nativeControls,
  playerSurface,
  storiesKeys,
  useActiveElement,
} from '../stories-keys';
import { playbackSpeeds, usePlayback, type Playback } from './playback';
import { clockRange, stepAt } from './recording-clock';
import { screenGap, screenSizes, type ScreenSize } from './screen-size';
import { TabScreen } from './tab-screen';
import { Timeline } from './timeline';

export type { Playback };

/** One clock for every Recording and Step of a Proof report. */
export function useRecordingsPlayback(
  recordings: readonly Recording[],
  steps: readonly Step[],
): Playback {
  const range = useMemo(
    () => clockRange(recordings, steps),
    [recordings, steps],
  );
  const firstFrame = Math.min(
    ...recordings.flatMap((recording) =>
      recording.frames.slice(0, 1).map((frame) => frame.at),
    ),
  );
  return usePlayback(
    range,
    Number.isFinite(firstFrame) ? firstFrame : range.start,
  );
}

interface PlayerProps {
  readonly recordings: readonly Recording[];
  readonly steps: readonly Step[];
  readonly phases: readonly PhaseReport[];
  readonly playback: Playback;
  readonly frameUrl: (file: string) => string;
}

/**
 * Every Tab's Recording side by side on the Proof's one clock, the Step
 * under way named over its Tab, and the Step timeline beneath. `Space`
 * plays and pauses, `F` plays it full screen, `Esc` comes back.
 */
export function RecordingsPlayer({
  className,
  ...props
}: PlayerProps & { readonly className?: string }) {
  const reducedMotion = useReducedMotion() ?? false;
  const [fullScreen, setFullScreen] = useState(false);
  usePreloadedFrames(props.recordings, props.frameUrl);
  const { toggle } = props.playback;

  // The player's keys work while it shows, around the Proof panel's own.
  // `useSurface` gives new functions on every move, so only the first opens.
  const surfaces = storiesKeys.useSurface();
  const surfacesRef = useRef(surfaces);
  surfacesRef.current = surfaces;
  useEffect(() => {
    surfacesRef.current.openSurface(playerSurface);
    return () => surfacesRef.current.closeSurface(playerSurface);
  }, []);
  // A focused control keeps Space for itself.
  const active = useActiveElement();
  const controlFocused = keepsKeys(
    active,
    document.body,
    `${nativeControls}, [role="button"]`,
  );
  storiesKeys.useAction('stories.proof-panel.player.playPause', toggle, {
    enabled: !controlFocused,
  });
  storiesKeys.useAction('stories.proof-panel.player.fullScreen', () =>
    setFullScreen((current) => !current),
  );
  // Without a Handler it shadows nothing: Escape closes the panel instead.
  storiesKeys.useAction(
    'stories.proof-panel.player.exitFullScreen',
    () => setFullScreen(false),
    { enabled: fullScreen },
  );

  return (
    <>
      <div
        className={cn(
          'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card',
          className,
        )}
      >
        {fullScreen ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 text-sm text-muted-foreground">
            Playing full screen · Esc to come back
          </div>
        ) : (
          <PlayerBody
            {...props}
            fullScreen={false}
            onFullScreen={() => setFullScreen(true)}
          />
        )}
      </div>
      {createPortal(
        <AnimatePresence>
          {fullScreen && (
            <motion.div
              key="full-screen"
              role="dialog"
              aria-label="Recordings, full screen"
              className="dark fixed inset-0 z-[100] flex flex-col bg-background text-foreground"
              initial={
                reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <PlayerBody
                {...props}
                fullScreen
                onFullScreen={() => setFullScreen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function PlayerBody({
  recordings,
  steps,
  phases,
  playback,
  frameUrl,
  fullScreen,
  onFullScreen,
}: PlayerProps & {
  readonly fullScreen: boolean;
  readonly onFullScreen: () => void;
}) {
  const [stageRef, area] = useContentSize();
  const sizes = useMemo(
    () => screenSizes(recordings, area),
    [recordings, area],
  );
  const { range, time, playing, speed } = playback;
  const currentStep = stepAt(steps, time);
  const ToggleIcon = fullScreen ? Minimize2 : Maximize2;

  return (
    <>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          fullScreen ? 'px-10 pb-4 pt-8' : 'bg-muted/40 px-6 pb-4 pt-6',
        )}
      >
        <div
          ref={stageRef}
          className="flex min-h-0 flex-1 items-center justify-center"
        >
          {area.width > 0 && (
            <div className="flex items-end" style={{ gap: screenGap }}>
              {recordings.map((recording, index) => (
                <TabScreen
                  key={recording.tab}
                  recording={recording}
                  size={sizes[index]!}
                  time={time}
                  step={currentStep}
                  frameUrl={frameUrl}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        className={cn(
          'shrink-0 border-t border-border px-3 pb-2 pt-3',
          fullScreen && 'mx-auto w-full max-w-6xl border-t-0 pb-6',
        )}
      >
        <div className="flex items-center gap-3 px-1.5 pb-1">
          <button
            type="button"
            onClick={playback.toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 active:scale-95"
          >
            {playing ? (
              <Pause className="size-3.5 fill-current" />
            ) : (
              <Play className="ml-0.5 size-3.5 fill-current" />
            )}
          </button>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {seconds(time)} / {seconds(range.end)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {currentStep === undefined ? (
              <span className="text-muted-foreground">No Step yet</span>
            ) : (
              <>
                <span
                  className={cn(
                    'font-medium',
                    !currentStep.passed && 'text-destructive',
                  )}
                >
                  {currentStep.name}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {currentStep.kind} on {currentStep.tab}
                </span>
              </>
            )}
          </span>
          <div className="flex shrink-0 rounded-md border border-border p-0.5">
            {playbackSpeeds.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => playback.setSpeed(option)}
                aria-pressed={speed === option}
                className={cn(
                  'h-6 rounded-[5px] px-2 font-mono text-[11px] tabular-nums transition-colors',
                  speed === option
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option}×
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onFullScreen}
            aria-label={fullScreen ? 'Leave full screen' : 'Full screen'}
            title={fullScreen ? 'Leave full screen (Esc)' : 'Full screen (F)'}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ToggleIcon className="size-4" />
          </button>
        </div>
        <Timeline
          range={range}
          time={time}
          steps={steps}
          phases={phases}
          currentStep={currentStep}
          onSeek={playback.seek}
        />
      </div>
    </>
  );
}

function useContentSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ScreenSize>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function usePreloadedFrames(
  recordings: readonly Recording[],
  frameUrl: (file: string) => string,
) {
  useEffect(() => {
    const images = recordings.flatMap((recording) =>
      recording.frames.map((frame) => {
        const image = new Image();
        image.src = frameUrl(frame.file);
        return image;
      }),
    );
    return () => {
      for (const image of images) image.src = '';
    };
  }, [recordings, frameUrl]);
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)} s`;
}
