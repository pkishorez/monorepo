import {
  ChartColumnIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  GitForkIcon,
  SquareIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Panel } from './parts/panel.tsx';
import { type Facts, inputOf, type Status, totalOf } from './facts.ts';
import {
  Bar,
  Big,
  Card,
  dollars,
  exactly,
  Facts as Rows,
  share,
  Split,
  tokenParts,
  tokens,
  took,
} from './parts/parts.tsx';

/*
 * One turn's details, opened from the line under it: which turn of how
 * many, and how it ended, as a mark and its time. Then, as its agent told
 * it, what it cost, every turn's cost in one bar with this one dark; and
 * its tokens, by what the cache held and what was new; each card opening
 * to every number. Then what can be done from it, a tile each: copy what
 * the agent said, fork the session after it, open the session's details.
 */

/** How a turn ended, in words, for those who do not see its mark. */
export const ENDED: Record<Status, string> = {
  done: 'Done',
  cancelled: 'Stopped by you',
  interrupted: 'Interrupted by the server',
  failed: 'Failed',
};

/** How a turn ended, as a mark: quiet when done, louder as it went worse. */
export function Ended({
  status,
  className,
}: {
  readonly status: Status | null;
  readonly className?: string;
}) {
  const icon = cn('size-3.5 shrink-0', className);
  if (status === null) return <Spinner aria-hidden className={icon} />;
  switch (status) {
    case 'done':
      return <CircleCheckIcon aria-hidden className={icon} />;
    case 'cancelled':
      return (
        <SquareIcon aria-hidden className={cn(icon, 'size-3 fill-current')} />
      );
    case 'interrupted':
      return (
        <TriangleAlertIcon aria-hidden className={cn(icon, 'text-warning')} />
      );
    case 'failed':
      return (
        <CircleXIcon aria-hidden className={cn(icon, 'text-destructive')} />
      );
  }
}

/** Forking the session after this turn. */
export interface Fork {
  readonly run: () => void;
  /** A fork is being made after this turn. */
  readonly pending: boolean;
  /** A fork is being made after another. */
  readonly disabled: boolean;
}

export function TurnDetails({
  open,
  onOpenChange,
  facts,
  turnId,
  said,
  fork,
  onSession,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly facts: Facts;
  readonly turnId: string;
  /** What the agent said in it, to copy. */
  readonly said: string;
  readonly fork: Fork | null;
  /** Opens the session's details, where the page has them. */
  readonly onSession: (() => void) | null;
}) {
  const turn = facts.turns.find(({ id }) => id === turnId);
  if (turn === undefined) return null;
  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      label={`Turn ${turn.n} of ${facts.turns.length}`}
      title={
        <>
          Turn {turn.n}
          <span className="font-normal text-muted-foreground">
            {' '}
            of {facts.turns.length}
          </span>
        </>
      }
      description={
        <span className="flex items-center gap-1.5 tabular-nums">
          <Ended status={turn.status} />
          <span className="sr-only">
            {turn.status === null ? 'Running' : ENDED[turn.status]}
          </span>
          {turn.duration !== null && took(turn.duration)}
        </span>
      }
    >
      {turn.cost !== null && facts.cost !== null && (
        <Cost facts={facts} turnId={turnId} cost={turn.cost} />
      )}
      {turn.tokens !== null && totalOf(turn.tokens) > 0 && (
        <Card
          label="Tokens"
          extra={
            <Rows
              rows={[
                ['Read from the cache', exactly(turn.tokens.read)],
                ...(turn.tokens.written > 0
                  ? [
                      [
                        'Written to the cache',
                        exactly(turn.tokens.written),
                      ] as const,
                    ]
                  : []),
                ['New input', exactly(turn.tokens.fresh)],
                ['Output', exactly(turn.tokens.output)],
                ['Total', exactly(totalOf(turn.tokens)), true],
              ]}
            />
          }
        >
          <Big
            value={tokens(totalOf(turn.tokens))}
            unit="tokens"
            aside={
              turn.tokens.read > 0
                ? `${share(turn.tokens.read, inputOf(turn.tokens))} cached`
                : undefined
            }
          />
          <Split label="This turn's tokens" parts={tokenParts(turn.tokens)} />
        </Card>
      )}
      <Actions said={said} fork={fork} onSession={onSession} />
    </Panel>
  );
}

/**
 * A part's share of a bar as flex-grow: in tenths of a cent, as parts
 * whose grows add up to less than one leave the rest of the bar empty.
 */
const grow = (usd: number) => usd * 1000;

/** What the turn cost beside the session so far, each turn a part of one bar. */
function Cost({
  facts,
  turnId,
  cost,
}: {
  readonly facts: Facts;
  readonly turnId: string;
  readonly cost: number;
}) {
  const total = facts.cost ?? 0;
  const costed = facts.turns.filter(
    (turn): turn is typeof turn & { cost: number } =>
      turn.cost !== null && turn.cost > 0,
  );
  const top = Math.max(...costed.map((turn) => turn.cost), 0);
  // What the turns' own costs do not hold: the original's, for a fork.
  const carried = total - costed.reduce((sum, turn) => sum + turn.cost, 0);
  return (
    <Card
      label="Cost"
      extra={
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3 text-sm">
          {costed.map((turn) => (
            <div
              key={turn.id}
              className={cn(
                'grid grid-cols-[1.5rem_1fr_3.5rem] items-center gap-3 tabular-nums',
                turn.id === turnId ? 'font-medium' : 'text-muted-foreground',
              )}
            >
              <span>{turn.n}</span>
              <span
                aria-hidden
                style={{ width: `${(turn.cost / top) * 100}%` }}
                className={cn(
                  'h-1.5 min-w-0.5 rounded-full',
                  turn.id === turnId ? 'bg-foreground' : 'bg-foreground/20',
                )}
              />
              <span className="text-right">{dollars(turn.cost)}</span>
            </div>
          ))}
          {carried >= 0.005 && (
            <div className="grid grid-cols-[1.5rem_1fr_3.5rem] gap-3 text-muted-foreground tabular-nums">
              <span aria-hidden>↰</span>
              <span>Before the fork</span>
              <span className="text-right">{dollars(carried)}</span>
            </div>
          )}
        </div>
      }
    >
      <Big
        value={dollars(cost)}
        unit={`of ${dollars(total)}`}
        aside={share(cost, total)}
      />
      <Bar
        label={`Turn costs, this one ${dollars(cost)} of ${dollars(total)}`}
        parts={[
          ...(carried >= 0.005
            ? [{ key: 'carried', value: grow(carried), tone: 1 as const }]
            : []),
          ...costed.map((turn) => ({
            key: turn.id,
            value: grow(turn.cost),
            tone: turn.id === turnId ? (4 as const) : (1 as const),
          })),
        ]}
      />
    </Card>
  );
}

const TILE =
  'focus-ring flex min-h-16 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-muted/50 px-2 text-xs text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:size-[18px] [&_svg]:text-foreground';

/** What can be done from a turn, a tile each, so more can join. */
function Actions({
  said,
  fork,
  onSession,
}: {
  readonly said: string;
  readonly fork: Fork | null;
  readonly onSession: (() => void) | null;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex gap-2">
      {said !== '' && (
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy the answer'}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(said)
              .then(() => setCopied(true));
          }}
          className={TILE}
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
      {fork !== null && (
        <button
          type="button"
          aria-label="Fork from here"
          title="A new session up to this turn"
          disabled={fork.disabled}
          onClick={fork.run}
          className={TILE}
        >
          {fork.pending ? <Spinner /> : <GitForkIcon aria-hidden />}
          Fork
        </button>
      )}
      {onSession !== null && (
        <button
          type="button"
          aria-label="Session details"
          onClick={onSession}
          className={TILE}
        >
          <ChartColumnIcon aria-hidden />
          Session
        </button>
      )}
    </div>
  );
}
