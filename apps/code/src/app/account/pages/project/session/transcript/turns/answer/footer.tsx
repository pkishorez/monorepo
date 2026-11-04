import { createContext, use, useState } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ENDED,
  Ended,
  type Facts,
  took,
  TurnDetails,
} from '../../../panels/details/index.ts';
import type { Row } from '../rows/index.ts';

/*
 * Under each turn, one quiet line across the column, how long it ran in
 * its middle: the end of the turn, and the way into its details, a click
 * or a tap anywhere on it (`../../../panels/details/`), where its answer is
 * copied and the session forked after it. How it ended shows on it as a
 * mark only when it did not simply finish: stopped, a square; interrupted,
 * in amber, since the server, not you, stopped it; failed, in red, why it
 * failed in a block above it.
 */

type EndedRow = Extract<Row, { readonly kind: 'ended' }>;

/** Forking the session after a finished turn. */
export interface Forking {
  readonly fork: (turnId: string) => void;
  /** The turn a fork is being made after, while it is. */
  readonly pending: string | null;
}

/** What every turn's details read: the session's facts, and the way to its own details. */
export const Told = createContext<{
  readonly facts: Facts;
  /** Opens the session's details; null where the page has none. */
  readonly session: (() => void) | null;
} | null>(null);

/** Where the page opens the session's details from a turn's; none outside a session's page. */
export const SessionOpener = createContext<(() => void) | null>(null);

export function Footer({
  turn,
  ended,
  said,
  forking,
}: {
  /** The turn it ends, as the transcript names it, which its details are of. */
  readonly turn: string;
  readonly ended: EndedRow;
  /** What the agent said in the turn, to copy. */
  readonly said: string;
  readonly forking?: Forking;
}) {
  const [open, setOpen] = useState(false);
  // Drawn once first opened, then kept so it can close in its own time.
  const [opened, setOpened] = useState(false);
  const told = use(Told);
  const time = ended.duration === null ? null : took(ended.duration);
  const pending = forking?.pending === ended.turnId;
  const marked = ended.status !== 'done';
  // Read aloud: how it ended, where the mark says so, and its time.
  const spoken = [marked ? ENDED[ended.status] : null, time]
    .filter((each) => each !== null)
    .join(', ');
  const stripe = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${spoken || 'Done'}. About this turn`}
      disabled={told === null}
      onClick={() => {
        setOpened(true);
        setOpen(true);
      }}
      className={cn(
        'group/stripe focus-ring flex min-h-8 w-full items-center gap-3 rounded-md text-xs text-muted-foreground pointer-coarse:min-h-11',
        "before:h-px before:flex-1 before:bg-border before:transition-colors before:duration-150 before:content-['']",
        "after:h-px after:flex-1 after:bg-border after:transition-colors after:duration-150 after:content-['']",
        'hover:before:bg-foreground/20 hover:after:bg-foreground/20 motion-reduce:before:transition-none motion-reduce:after:transition-none',
        'disabled:cursor-default',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 tabular-nums transition-[background-color,color,scale] duration-150 ease-out motion-reduce:transition-none',
          'group-hover/stripe:bg-muted group-hover/stripe:text-foreground group-aria-expanded/stripe:bg-muted group-aria-expanded/stripe:text-foreground group-active/stripe:scale-[0.97]',
          ended.status === 'interrupted' && 'text-warning',
          ended.status === 'failed' && 'text-destructive',
        )}
      >
        {marked && <Ended status={ended.status} className="size-3" />}
        {time ?? (marked ? null : 'Done')}
      </span>
    </button>
  );
  const details = told !== null && opened && (
    <TurnDetails
      open={open}
      onOpenChange={setOpen}
      facts={told.facts}
      turnId={turn}
      said={said}
      fork={
        forking === undefined
          ? null
          : {
              run: () => forking.fork(ended.turnId),
              pending,
              disabled: forking.pending !== null,
            }
      }
      onSession={
        told.session === null
          ? null
          : () => {
              setOpen(false);
              told.session?.();
            }
      }
    />
  );
  if (ended.status !== 'failed')
    return (
      <>
        {stripe}
        {details}
      </>
    );
  return (
    <div className="flex flex-col gap-1">
      <p
        role="alert"
        className="rounded-xl bg-destructive/10 px-4 py-3 text-sm break-words text-destructive"
      >
        {ended.error ?? 'It failed.'}
      </p>
      {stripe}
      {details}
    </div>
  );
}
