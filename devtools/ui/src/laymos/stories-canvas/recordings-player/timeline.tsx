import { useRef, useState, type PointerEvent } from 'react';
import { cn } from '@kstackz/web-platform/components/utils';
import type { PhaseReport, Step } from 'laymos/story/schema';

import { storiesKeys } from '../stories-keys';
import type { ClockRange } from './recording-clock';

const phaseNames = {
  prepare: 'Preparation',
  act: 'Action',
  verify: 'Verification',
} as const;

export function Timeline({
  range,
  time,
  steps,
  phases,
  currentStep,
  onSeek,
}: {
  readonly range: ClockRange;
  readonly time: number;
  readonly steps: readonly Step[];
  readonly phases: readonly PhaseReport[];
  readonly currentStep: Step | undefined;
  readonly onSeek: (time: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const span = Math.max(1, range.end - range.start);
  // The arrows seek while the clock has focus.
  const [focused, setFocused] = useState(false);
  storiesKeys.useAction(
    'stories.proof-panel.player.seekBack',
    () => onSeek(time - span / 50),
    { enabled: focused },
  );
  storiesKeys.useAction(
    'stories.proof-panel.player.seekForward',
    () => onSeek(time + span / 50),
    { enabled: focused },
  );
  const percent = (at: number) =>
    `${((Math.min(range.end, Math.max(range.start, at)) - range.start) / span) * 100}%`;

  const seekTo = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (track === null) return;
    const bounds = track.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    onSeek(range.start + Math.min(1, Math.max(0, ratio)) * span);
  };

  return (
    <div className="select-none px-1.5">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Proof clock"
        aria-valuemin={Math.round(range.start)}
        aria-valuemax={Math.round(range.end)}
        aria-valuenow={Math.round(time)}
        className="focus-ring relative h-9 cursor-pointer rounded-md"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekTo(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            seekTo(event);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/25"
          style={{ width: percent(time) }}
        />
        {steps.map((step, index) => (
          <button
            key={`${step.startedAt}-${index}`}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSeek(step.startedAt)}
            className="group absolute top-1/2 z-10 flex h-5 -translate-x-1/2 -translate-y-1/2 items-center px-1"
            style={{ left: percent(step.startedAt) }}
            aria-label={`Seek to ${step.name}`}
          >
            <span
              className={cn(
                'h-3.5 w-[3px] rounded-full transition-[height,background-color]',
                step.passed ? 'bg-foreground/55' : 'bg-destructive',
                step === currentStep && 'h-5 bg-foreground',
                step === currentStep && !step.passed && 'bg-destructive',
              )}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              {step.name}
              <span className="ml-1.5 text-muted-foreground">{step.tab}</span>
            </span>
          </button>
        ))}
        <div
          className="pointer-events-none absolute top-0 z-20 h-full w-px -translate-x-1/2 bg-foreground"
          style={{ left: percent(time) }}
        >
          <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground" />
        </div>
      </div>
      <div className="relative h-4">
        {phases
          .filter(
            (phase) =>
              phase.endedAt > range.start && phase.startedAt < range.end,
          )
          .map((phase) => (
            <span
              key={phase.phase}
              className="absolute top-0 truncate border-l border-border pl-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
              style={{
                left: percent(phase.startedAt),
                width: `calc(${percent(phase.endedAt)} - ${percent(phase.startedAt)})`,
              }}
            >
              <span title={phaseNames[phase.phase]}>
                {phaseNames[phase.phase]}
              </span>
            </span>
          ))}
      </div>
    </div>
  );
}
