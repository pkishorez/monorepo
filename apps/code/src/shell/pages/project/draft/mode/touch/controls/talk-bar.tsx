import { Button } from '@kestack/web-platform/ui/components/button';
import {
  MicIcon,
  RotateCcwIcon,
  SquareIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactNode } from 'react';

/*
 * The wide bar in voice mode, one element through every one of its jobs:
 * Tap to talk; Waiting, quiet, while the microphone opens, a tap letting
 * go of it; while one records, red, with its time and level, a tap
 * stopping it; Transcribing; failed, Try again. Its colour crosses over,
 * and each job's words, all drawn in one cell, fade and rise into place
 * as the last fade away, so none moves the bar.
 */

/** The bar's one job now. */
export type Voice = 'dictate' | 'wait' | 'take' | 'busy' | 'resend';

/** A Dictation waiting for the microphone or recording, as the Draft draws it. */
export type Recording =
  | { readonly _tag: 'Waiting' }
  | {
      readonly _tag: 'Recording';
      readonly elapsed: ReactNode;
      readonly wave: ReactNode;
    }
  | null;

const LABEL: Record<Voice, string> = {
  dictate: 'Dictate',
  wait: 'Waiting for the microphone: tap to cancel',
  take: 'Stop the Dictation',
  busy: 'Transcribing',
  resend: 'Couldn’t transcribe: try again',
};

export function TalkBar({
  voice,
  recording,
  disabled,
  quiet,
  onPress,
}: {
  readonly voice: Voice;
  readonly recording: Recording;
  readonly disabled: boolean;
  /** Send beside it is the main action now. */
  readonly quiet: boolean;
  readonly onPress: () => void;
}) {
  const said: Record<Voice, ReactNode> = {
    dictate: (
      <>
        <MicIcon aria-hidden />
        {quiet ? 'Talk' : 'Tap to talk'}
      </>
    ),
    // Its spinner only while it waits, as with Transcribing.
    wait: (
      <>
        {voice === 'wait' && <Spinner />}
        Waiting
      </>
    ),
    // Its time and level, only while it records: nothing to say otherwise.
    take: voice === 'take' && recording?._tag === 'Recording' && (
      <span className="flex w-full min-w-0 items-center justify-between gap-3">
        <Listening recording={recording} />
        <SquareIcon aria-hidden fill="currentColor" className="size-4!" />
      </span>
    ),
    // Its spinner only while it spins for something: one looping out of
    // sight still keeps the page busy, enough to cost a Swipe its speed.
    busy: (
      <>
        {voice === 'busy' && <Spinner />}
        Transcribing…
      </>
    ),
    resend: (
      <>
        <RotateCcwIcon aria-hidden />
        Try again
      </>
    ),
  };
  return (
    <Button
      type="button"
      aria-label={LABEL[voice]}
      disabled={disabled || voice === 'busy'}
      onClick={onPress}
      className={cn(
        'grid h-14 w-full min-w-0 overflow-hidden rounded-full px-5 text-base font-medium disabled:opacity-100 [&_svg:not([class*=size-])]:size-5',
        'transition-[background-color,color,box-shadow,scale] duration-200 ease-out active:not-disabled:scale-[0.98] motion-reduce:transition-none',
        voice === 'wait' &&
          'bg-muted text-foreground ring-1 ring-destructive/40 ring-inset hover:bg-muted',
        voice === 'take' && 'bg-destructive text-white hover:bg-destructive/90',
        voice === 'busy' && 'bg-muted text-muted-foreground hover:bg-muted',
        voice === 'resend' &&
          'bg-warning/15 text-foreground ring-1 ring-warning/60 ring-inset hover:bg-warning/25 [&_svg]:text-warning',
        voice === 'dictate' &&
          quiet &&
          'bg-background text-foreground ring-1 ring-border ring-inset hover:bg-muted',
      )}
    >
      {(Object.keys(said) as Array<Voice>).map((each) => (
        <span
          key={each}
          aria-hidden
          data-shown={each === voice || undefined}
          className={cn(
            'col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-2.5',
            'transition-[opacity,translate,filter] duration-150 ease-[cubic-bezier(0.4,0,1,1)] motion-reduce:transition-none',
            'not-data-shown:translate-y-1 not-data-shown:opacity-0 not-data-shown:blur-[2px]',
            'data-shown:duration-250 data-shown:ease-[cubic-bezier(0.32,0.72,0,1)]',
          )}
        >
          {said[each]}
        </span>
      ))}
    </Button>
  );
}

/** While one records: its breathing dot, its time and its level. */
function Listening({
  recording,
}: {
  readonly recording: Extract<Recording, { _tag: 'Recording' }>;
}) {
  return (
    <span role="status" className="flex min-w-0 items-center gap-2 text-sm">
      <span
        aria-hidden
        className="size-2 shrink-0 animate-breathe rounded-full bg-current motion-reduce:animate-none"
      />
      <span className="sr-only">Recording</span>
      <span className="tabular-nums">{recording.elapsed}</span>
      <span className="min-w-0 overflow-hidden">{recording.wave}</span>
    </span>
  );
}
