import type { Usage } from '@kestack/connect/code';
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  GitForkIcon,
  InfoIcon,
  SquareIcon,
  TriangleAlertIcon,
} from '@kestack/web-platform/ui/components/lucide';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { type ReactNode, useEffect, useState } from 'react';
import type { Row } from '../rows/index.ts';

/*
 * Under each turn, one quiet row: on the left, a way to copy what the
 * agent said and to fork the session there; on the right, an info button
 * that opens what the turn took: how it ended and how long it ran, the
 * tokens it sent, read again from the cache and wrote, what it cost by
 * itself, and the session so far. The row shows on pointing at the turn,
 * and always on a touch screen. How a turn ended shows only when it did
 * not simply finish: stopped, said plainly; interrupted, in amber, since
 * the server, not you, stopped it; failed, in red, with why.
 */

type EndedRow = Extract<Row, { readonly kind: 'ended' }>;

/** Forking the session after a finished turn. */
export interface Forking {
  readonly fork: (turnId: string) => void;
  /** The turn a fork is being made after, while it is. */
  readonly pending: string | null;
}

/** What a turn cost, by itself and for the session so far, in USD; null when not told. */
export type Spend = {
  readonly turn: number | null;
  readonly total: number | null;
};

const dollars = (usd: number) =>
  usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;

const count = (n: number) => n.toLocaleString('en');

export const took = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** Shown on pointing at the turn, or focus; always on a touch screen. */
const QUIET =
  'opacity-0 transition-opacity duration-150 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100';

const BUTTON =
  'focus-ring grid size-11 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:cursor-default keyboard:size-7 [&_svg]:size-3.5';

const ENDED: Record<EndedRow['status'], string> = {
  done: 'Done',
  cancelled: 'Stopped by you',
  interrupted: 'Interrupted',
  failed: 'Failed',
};

export function Footer({
  ended,
  said,
  forking,
  spend,
}: {
  readonly ended: EndedRow;
  /** What the agent said in the turn, to copy. */
  readonly said: string;
  readonly forking?: Forking;
  readonly spend?: Spend;
}) {
  const time = ended.duration === null ? null : took(ended.duration);
  const row = (
    <div className="flex min-h-8 items-center text-xs text-muted-foreground">
      {ended.status === 'cancelled' && (
        <span className="mr-2 flex items-center gap-1.5 font-medium text-foreground/80">
          <SquareIcon aria-hidden className="size-3 fill-current" />
          You stopped it{time ? ` after ${time}` : ''}
        </span>
      )}
      {ended.status === 'interrupted' && (
        <span className="mr-2 flex items-center gap-1.5 font-medium text-warning">
          <TriangleAlertIcon aria-hidden className="size-3.5" />
          Interrupted: the server stopped while this ran
        </span>
      )}
      <Actions ended={ended} said={said} forking={forking} />
      <Info ended={ended} spend={spend} />
    </div>
  );
  if (ended.status !== 'failed') return row;
  return (
    <div className="flex flex-col gap-1">
      <p
        role="alert"
        className="flex items-start gap-2.5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 break-words">
          <span className="font-medium">
            It failed{time ? ` after ${time}` : ''}.
          </span>
          {ended.error && ` ${ended.error}`}
        </span>
      </p>
      {row}
    </div>
  );
}

/** One line of the info: what it is, and its value, lined up on the right. */
function Fact({
  name,
  children,
}: {
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </>
  );
}

/** The info button, at the right of the row, and what it opens. */
function Info({
  ended,
  spend,
}: {
  readonly ended: EndedRow;
  readonly spend?: Spend;
}) {
  const usage: Usage | null = ended.usage;
  const sent =
    usage === null ? null : usage.inputTokens + (usage.cacheWriteTokens ?? 0);
  const cached = usage?.cacheReadTokens ?? 0;
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About this turn"
        title="About this turn"
        className={`${BUTTON} ml-auto data-popup-open:bg-muted data-popup-open:text-foreground data-popup-open:opacity-100 ${QUIET}`}
      >
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 gap-3 p-3.5">
        <span className="text-xs font-medium text-muted-foreground">
          This turn
        </span>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
          <Fact name="Ended">{ENDED[ended.status]}</Fact>
          {ended.duration !== null && (
            <Fact name="Ran for">{took(ended.duration)}</Fact>
          )}
          {usage !== null && sent !== null && (
            <>
              <Fact name="Tokens in">{count(sent)}</Fact>
              {cached > 0 && (
                <Fact name="Read from cache">{count(cached)}</Fact>
              )}
              <Fact name="Tokens out">{count(usage.outputTokens)}</Fact>
            </>
          )}
          {spend?.turn != null && (
            <Fact name="Cost">{dollars(spend.turn)}</Fact>
          )}
        </dl>
        {/* Only when it says more than the turn's own: not for a session of one turn. */}
        {spend?.total != null && spend.total !== spend.turn && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 border-t border-border/70 pt-3 text-sm">
            <Fact name="Session so far">{dollars(spend.total)}</Fact>
          </dl>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Actions({
  ended,
  said,
  forking,
}: {
  readonly ended: EndedRow;
  readonly said: string;
  readonly forking?: Forking;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const pending = forking?.pending === ended.turnId;
  if (said === '' && forking === undefined) return null;
  return (
    <span
      className={`-ml-1 flex items-center ${pending || copied ? 'opacity-100' : QUIET}`}
    >
      {said !== '' && (
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy the answer'}
          title="Copy the answer"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(said)
              .then(() => setCopied(true));
          }}
          className={BUTTON}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      )}
      {forking && (
        <button
          type="button"
          aria-label="Fork from here"
          title="Fork from here"
          disabled={forking.pending !== null}
          onClick={() => forking.fork(ended.turnId)}
          className={BUTTON}
        >
          {pending ? <Spinner /> : <GitForkIcon />}
        </button>
      )}
    </span>
  );
}
