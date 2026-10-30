import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  CheckIcon,
  MicIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactNode } from 'react';
import { Add } from './add.tsx';
import { Slot } from './slot.tsx';

/*
 * The Touch Draft's controls, as three cells of its grid: one button on
 * the left, what the Dictation is doing in the middle while it does
 * anything, and on the right the microphone and Send. Collapsed, the
 * middle is the words' own cell, drawn over them; expanded, it is the
 * room between the two sides under them.
 *
 * Phase         left     middle                    right
 * idle          Add      (the words)               microphone, Send
 * waiting       Cancel   Starting the microphone   (none)
 * recording     Cancel   its time and level        Done, Send
 * transcribing  Cancel   Writing it out            Send, waiting
 * failed        Discard  (the words, with Retry)   Try again, Send
 *
 * Send shows once there is something to send, or while one records.
 * While a turn runs and nothing records, Stop stands where Send would be,
 * filled while there is nothing to send, quiet beside Send once there is.
 */

/** A running turn's Stop, as the page hands it to the Draft. */
export type Stop = {
  readonly run: () => void;
  readonly stopping: boolean;
  /** Nothing can be stopped, as while the Connection is out of reach. */
  readonly disabled: boolean;
};

/** What the line is doing now: each draws its own controls. */
export type Phase =
  | 'idle'
  | 'waiting'
  | 'recording'
  | 'transcribing'
  | 'failed';

/** A round button, a thumb's. */
const ROUND =
  'size-12 shrink-0 rounded-full [&_svg:not([class*=size-])]:size-5';
/**
 * The filled one on the right, Send or Stop: collapsed, smaller in the
 * same cell, so it sits inside the card's round corner, never against it.
 */
const PRIMARY = cn(
  ROUND,
  'size-11 in-data-collapsed:m-1 in-data-collapsed:size-10',
);
const QUIET = cn(
  ROUND,
  'text-muted-foreground shadow-none hover:bg-muted active:bg-muted aria-expanded:bg-muted',
);

/** Keeps focus where it is on a press: the keyboard stays up as Send is pressed. */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

/** A Dictation recording, as the Draft draws it. */
export interface Recording {
  readonly elapsed: ReactNode;
  readonly wave: ReactNode;
}

export function Controls({
  phase,
  disabled,
  recording,
  add,
  send,
  stop,
  onDictate,
  onTake,
  onRetry,
  onCancel,
}: {
  readonly phase: Phase;
  readonly disabled: boolean;
  readonly recording: Recording | null;
  readonly add: Omit<Parameters<typeof Add>[0], 'disabled' | 'className'>;
  readonly send: {
    readonly label: string;
    /** There is something to send, or one records to be sent. */
    readonly shown: boolean;
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onSend: () => void;
  };
  readonly stop: Stop | null;
  readonly onDictate: () => void;
  readonly onTake: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}) {
  const quiet = (label: string, icon: ReactNode, onClick: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      className={QUIET}
    >
      {icon}
    </Button>
  );
  return (
    <>
      {/* Left */}
      <div className="flex [grid-area:left]">
        <Slot
          shown={
            phase === 'idle' ? 'add' : phase === 'failed' ? 'discard' : 'cancel'
          }
          items={{
            add: <Add disabled={disabled} className={QUIET} {...add} />,
            cancel: quiet(
              'Cancel the Dictation',
              <XIcon aria-hidden />,
              onCancel,
            ),
            discard: quiet(
              'Throw the recording away',
              <Trash2Icon aria-hidden />,
              onCancel,
            ),
          }}
        />
      </div>
      {/* Middle */}
      {(phase === 'waiting' ||
        phase === 'recording' ||
        phase === 'transcribing') && (
        <div
          role="status"
          className="relative z-10 flex min-w-0 items-center gap-2 bg-card px-1 text-[0.9375rem] [grid-area:mid] in-data-collapsed:[grid-area:words]"
        >
          {phase === 'recording' && recording !== null ? (
            <Listening recording={recording} />
          ) : (
            <>
              <Spinner />
              <span className="truncate text-muted-foreground">
                {phase === 'waiting'
                  ? 'Starting the microphone…'
                  : 'Writing it out…'}
              </span>
            </>
          )}
        </div>
      )}
      {/* Right */}
      <div className="flex items-center gap-1 [grid-area:right]">
        {phase === 'idle' &&
          quiet('Dictate', <MicIcon aria-hidden />, onDictate)}
        {phase === 'recording' && (
          <Button
            type="button"
            size="icon"
            aria-label="Stop, and keep it to read"
            onMouseDown={keepFocus}
            onClick={onTake}
            className={cn(
              ROUND,
              'bg-destructive text-white hover:bg-destructive/90 active:scale-[0.96] [&_svg:not([class*=size-])]:size-6',
              'transition-[background-color,scale] duration-150 ease-out motion-reduce:transition-none',
            )}
          >
            <CheckIcon aria-hidden strokeWidth={2.5} />
          </Button>
        )}
        {phase === 'failed' &&
          quiet('Try again', <RotateCcwIcon aria-hidden />, onRetry)}
        {stop !== null && phase === 'idle' && (
          <Button
            type="button"
            variant={send.shown ? 'ghost' : 'default'}
            size="icon"
            aria-label="Stop the turn"
            disabled={stop.disabled || stop.stopping}
            onMouseDown={keepFocus}
            onClick={stop.run}
            className={cn(
              send.shown ? QUIET : PRIMARY,
              'transition-[background-color,color,scale] duration-150 ease-out active:not-disabled:scale-[0.96] motion-reduce:transition-none',
            )}
          >
            {stop.stopping ? (
              <Spinner />
            ) : (
              <SquareIcon aria-hidden className="size-3.5 fill-current" />
            )}
          </Button>
        )}
        {send.shown && (
          <Button
            type="button"
            size="icon"
            aria-label={send.label}
            disabled={send.disabled}
            onMouseDown={keepFocus}
            onClick={send.onSend}
            className={cn(
              PRIMARY,
              'transition-[background-color,color,scale] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 motion-reduce:transition-none',
            )}
          >
            {send.busy ? <Spinner /> : <ArrowUpIcon aria-hidden />}
          </Button>
        )}
      </div>
    </>
  );
}

/** While one records: its breathing dot and time, then its waveform across the rest. */
function Listening({ recording }: { readonly recording: Recording }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 animate-breathe rounded-full bg-destructive motion-reduce:animate-none"
        />
        <span className="sr-only">Recording</span>
        <span className="font-medium text-foreground tabular-nums">
          {recording.elapsed}
        </span>
      </span>
      <span className="flex min-w-0 flex-1">{recording.wave}</span>
    </span>
  );
}
