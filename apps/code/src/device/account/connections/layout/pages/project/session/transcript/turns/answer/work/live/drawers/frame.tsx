import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, CheckIcon, SquareIcon, XIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  DialogClose,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import {
  DrawerClose,
  DrawerTitle,
} from '@kestack/web-platform/ui/components/drawer';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { elapsed } from '../../../../../../../../../../../../../ui/labels/status/index.ts';

/*
 * What every drawer of running work is drawn in, a subagent's or a
 * command's: a head with only what it is and a way to close it, and a
 * foot that stays at the bottom however far its body scrolls, saying where
 * it stands and for how long, what else is known of it, and, while it
 * runs, Stop. And what both read alike: a field of the call that started
 * it, and what a closing one still shows.
 */

/** A call's input field, when it is text. */
export const said = (input: unknown, key: string): string | null => {
  if (typeof input !== 'object' || input === null) return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

/** The last value that was not undefined: what a drawer shows as it closes. */
export const useKept = <A,>(value: A | undefined): A | undefined => {
  const kept = useRef(value);
  if (value !== undefined) kept.current = value;
  return value ?? kept.current;
};

/** A dialog, with a keyboard or a mouse, or a drawer, on a touch screen. */
export type Layer = 'dialog' | 'drawer';

const TITLE = { dialog: DialogTitle, drawer: DrawerTitle } as const;
const CLOSE = { dialog: DialogClose, drawer: DrawerClose } as const;

export function Head({
  layer,
  icon,
  title,
  back,
}: {
  readonly layer: Layer;
  readonly icon: ReactNode;
  readonly title: string;
  /** Goes back to the one before, in a dialog that shows one at a time. */
  readonly back?: (() => void) | null;
}) {
  const Title = TITLE[layer];
  const Close = CLOSE[layer];
  return (
    <header className="shrink-0 border-b border-border/70">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6 sm:pt-4">
        {back != null && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back to the subagent that asked it"
            title="Back (Esc)"
            onClick={back}
            className="-ml-2 shrink-0 pointer-coarse:size-11"
          >
            <ArrowLeftIcon aria-hidden className="size-4" />
          </Button>
        )}
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        <Title className="min-w-0 flex-1 truncate text-base leading-6 font-medium">
          {title}
        </Title>
        <Close
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="-mr-2 shrink-0 pointer-coarse:size-11"
            />
          }
        >
          <XIcon aria-hidden className="size-4" />
        </Close>
      </div>
    </header>
  );
}

/** Where running work stands, as its foot says it. */
export type Standing =
  | 'running'
  | 'stopping'
  | 'done'
  | 'failed'
  | 'stopped'
  /** A command no longer listed, not stopped from here. */
  | 'ended';

/** What the foot says before how long it took. */
const WORD: Record<Standing, string> = {
  running: 'Running',
  stopping: 'Stopping',
  done: 'Done in',
  failed: 'Failed after',
  stopped: 'Stopped after',
  ended: 'Ended after',
};

/** Its word when how long it took is not known. */
const ALONE: Record<Standing, string> = {
  running: 'Running',
  stopping: 'Stopping',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
  ended: 'Ended',
};

/** The time now, again each second while `ticking`. */
const useNow = (ticking: boolean) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  return now;
};

function Mark({ standing }: { readonly standing: Standing }) {
  if (standing === 'running' || standing === 'stopping')
    return <Spinner aria-hidden className="size-3.5 shrink-0" />;
  if (standing === 'done')
    return (
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-positive text-background"
      >
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  if (standing === 'failed')
    return (
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-destructive text-white"
      >
        <XIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  return (
    <span
      aria-hidden
      className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-background"
    >
      <SquareIcon className="size-1.5 fill-current" />
    </span>
  );
}

export function Foot({
  standing,
  since,
  until,
  background,
  details,
  onStop,
}: {
  readonly standing: Standing;
  /** When it started, in epoch ms; null when not known. */
  readonly since: number | null;
  /** When it ended; null while it runs, or when not known. */
  readonly until: number | null;
  readonly background: boolean;
  /** What else is known of it, each said once, in order. */
  readonly details: ReadonlyArray<string>;
  /** Stops it; null when it cannot be stopped from here. */
  readonly onStop: (() => void) | null;
}) {
  const live = standing === 'running' || standing === 'stopping';
  const now = useNow(live && since !== null);
  const end = live ? now : until;
  const took =
    since === null || end === null || standing === 'stopping'
      ? null
      : elapsed(end - since);
  return (
    <footer className="shrink-0 border-t border-border/70 bg-background">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Mark standing={standing} />
            <span
              className={`font-medium ${standing === 'failed' ? 'text-destructive' : ''}`}
            >
              {took === null ? ALONE[standing] : WORD[standing]}
            </span>
            {took !== null && (
              <span className="text-muted-foreground tabular-nums">{took}</span>
            )}
            {background && (
              <span className="shrink-0 rounded-full border border-border/70 px-1.5 py-px text-[11px] leading-4 text-muted-foreground">
                Background
              </span>
            )}
          </div>
          {details.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              {details.map((each, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <span aria-hidden>·</span>}
                  <span className="truncate">{each}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {live && onStop !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={standing === 'stopping'}
            onClick={onStop}
            className="shrink-0 rounded-full px-3 pointer-coarse:h-10 pointer-coarse:px-4"
          >
            {standing === 'stopping' ? (
              <Spinner />
            ) : (
              <SquareIcon aria-hidden className="size-3 fill-current" />
            )}
            Stop
          </Button>
        )}
      </div>
    </footer>
  );
}
