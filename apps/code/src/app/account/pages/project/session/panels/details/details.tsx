import type { ContextUsage } from '@kestack/connect/code';
import { RefreshCwIcon, RotateCwIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Panel } from './parts/panel.tsx';
import { levelOf } from './parts/tokens.ts';
import { type Facts, inputOf, totalOf, type TurnFacts } from './facts.ts';
import {
  Bar,
  Big,
  dollars,
  Figure,
  Meter,
  Pill,
  share,
  Split,
  tokenParts,
  tokens,
  took,
} from './parts/parts.tsx';

/*
 * A session's details, opened from Actions, a turn's details, the context
 * by the Draft, or Ctrl+G, in four parts, each a word over what it shows.
 * Context: how full the agent's context is, and each of the plan's
 * limits, as the agent last said, with a button to read them again, even
 * with its agent closed. Then four numbers:
 * cost, where its agent tells it, turns, the agent's time and tokens.
 * Tokens: one bar of what the cache held and what was new. Turns: each a
 * bar as long as what it cost, or its tokens where no cost is told, made
 * of its tokens' parts, in order or longest first; a click or a tap shows
 * it in the transcript. Only what the agent reported is shown.
 */

/** How full the context is, and the plan's limits, as the agent says now. */
export type Context = ContextUsage;

/** How reading the context again goes, and the way to ask. */
export interface Reload {
  readonly run: () => void;
  readonly reloading: boolean;
  /** Why the last try could not read it; null when it could. */
  readonly problem: string | null;
  /** Its Connection cannot be reached. */
  readonly disabled: boolean;
}

export function SessionDetails({
  open,
  onOpenChange,
  title,
  about,
  facts,
  context,
  reload,
  onGo,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** The agent and model it runs with. */
  readonly about: string;
  readonly facts: Facts;
  /** Null until the agent is first read. */
  readonly context: Context | null;
  readonly reload: Reload;
  /** Shows a turn in the transcript. */
  readonly onGo: (turnId: string) => void;
}) {
  const go = (turnId: string) => {
    onOpenChange(false);
    onGo(turnId);
  };
  const costed = facts.cost !== null;
  const input = inputOf(facts.tokens);
  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      title={title || 'Untitled session'}
      description={about}
      wide
      tall
    >
      <div className="flex flex-col gap-8 pt-1">
        <ContextPart context={context} reload={reload} />
        <div
          className={cn(
            'grid grid-cols-2 gap-4',
            costed ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          {costed && <Figure value={dollars(facts.cost ?? 0)} name="Cost" />}
          <Figure value={facts.turns.length} name="Turns" />
          <Figure value={took(facts.duration)} name="Time" />
          <Figure value={tokens(totalOf(facts.tokens))} name="Tokens" />
        </div>
        {input > 0 && (
          <Part
            name="Tokens"
            aside={`${share(facts.tokens.read, input)} cached`}
          >
            <Split
              label="The session's tokens"
              parts={tokenParts(facts.tokens)}
            />
          </Part>
        )}
        <Turns facts={facts} onGo={go} />
      </div>
    </Panel>
  );
}

/** One part of the details: its word, what qualifies it on the right, and what it shows. */
function Part({
  name,
  aside,
  children,
}: {
  readonly name: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{name}</h3>
        {aside !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** When a limit starts over: its time today, else its day. */
const resetOf = (at: number, now = Date.now()) =>
  at - now < 24 * 3600 * 1000
    ? new Date(at).toLocaleTimeString('en', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : new Date(at).toLocaleDateString('en', { weekday: 'short' });

function ContextPart({
  context,
  reload,
}: {
  readonly context: Context | null;
  readonly reload: Reload;
}) {
  const used = context?.usedTokens;
  const max = context?.maxTokens;
  const limits = context?.rateLimits ?? [];
  const known = used !== undefined && max !== undefined;
  return (
    <Part
      name="Context"
      aside={
        <span className="flex items-center gap-2">
          {reload.problem !== null && known && (
            <span title={reload.problem}>Could not reload</span>
          )}
          {known && <Pill level={levelOf(used, max)} />}
          <button
            type="button"
            aria-label="Reload context"
            aria-busy={reload.reloading}
            title="Reload context"
            disabled={reload.disabled || reload.reloading}
            onClick={reload.run}
            className="focus-ring flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground motion-reduce:transition-none pointer-coarse:size-8"
          >
            <RefreshCwIcon
              aria-hidden
              className={cn(
                'size-3.5',
                reload.reloading && 'animate-spin motion-reduce:animate-none',
              )}
            />
          </button>
        </span>
      }
    >
      {known ? (
        <div className="flex flex-col gap-2.5">
          <Big
            value={tokens(used)}
            unit={`of ${tokens(max)}`}
            aside={share(used, max)}
          />
          <Meter used={used} max={max} label="Context used" />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <span className="h-2 rounded-full border border-dashed border-border" />
          <span className="text-xs text-muted-foreground">
            {reload.reloading ? 'Reading…' : (reload.problem ?? 'Not read yet')}
          </span>
        </div>
      )}
      {limits.length > 0 && (
        <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {limits.map((limit) => (
            <div key={limit.label} className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-foreground first-letter:uppercase">
                  {limit.label}
                </span>
                {limit.resetsAt !== undefined && (
                  <span
                    title="Starts over"
                    className="flex items-center gap-1 text-muted-foreground"
                  >
                    <RotateCwIcon aria-hidden className="size-3" />
                    <span className="sr-only">starts over</span>
                    {resetOf(limit.resetsAt)}
                  </span>
                )}
                <span className="ml-auto text-muted-foreground">
                  {Math.round(limit.usedPercent)}%
                </span>
              </div>
              <Meter
                used={limit.usedPercent}
                max={100}
                label={`${limit.label} limit used`}
                thin
              />
            </div>
          ))}
        </div>
      )}
    </Part>
  );
}

/** Every turn, a bar each, in order or longest first; each shows itself in the transcript. */
function Turns({
  facts,
  onGo,
}: {
  readonly facts: Facts;
  readonly onGo: (turnId: string) => void;
}) {
  const [biggest, setBiggest] = useState(false);
  const costed = facts.cost !== null;
  const sizeOf = (turn: TurnFacts) =>
    costed ? (turn.cost ?? 0) : turn.tokens === null ? 0 : totalOf(turn.tokens);
  if (facts.turns.length === 0) return null;
  const turns = biggest
    ? [...facts.turns].sort((a, b) => sizeOf(b) - sizeOf(a))
    : facts.turns;
  const top = Math.max(...facts.turns.map(sizeOf), 0);
  return (
    <Part
      name="Turns"
      aside={
        <span
          role="radiogroup"
          aria-label="Order"
          className="flex rounded-lg bg-muted p-0.5"
        >
          {(
            [
              [false, 'Order'],
              [true, costed ? 'Cost' : 'Tokens'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={biggest === value}
              onClick={() => setBiggest(value)}
              className="focus-ring min-h-6 rounded-md px-2 text-muted-foreground transition-colors duration-150 aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm motion-reduce:transition-none pointer-coarse:min-h-8 dark:aria-checked:bg-card"
            >
              {label}
            </button>
          ))}
        </span>
      }
    >
      <ol className="-mx-2 flex flex-col">
        {turns.map((turn) => {
          const size = sizeOf(turn);
          return (
            <li key={turn.id}>
              <button
                type="button"
                onClick={() => onGo(turn.id)}
                className="focus-ring grid min-h-10 w-full grid-cols-[1rem_minmax(0,1fr)_minmax(2.5rem,18%)_3.25rem] sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(3rem,30%)_3.5rem] items-center gap-3 rounded-lg px-2 text-left text-sm transition-colors duration-150 hover:bg-muted/60 active:bg-muted motion-reduce:transition-none pointer-coarse:min-h-12"
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {turn.n}
                </span>
                <span className="truncate">
                  {turn.prompt || 'Started by the agent'}
                </span>
                {/* As long as its share of the turn that took the most. */}
                <span className="flex">
                  {turn.tokens !== null && size > 0 && top > 0 && (
                    <span
                      className="flex min-w-1.5"
                      style={{ width: `${(size / top) * 100}%` }}
                    >
                      <Bar
                        label={`Turn ${turn.n}'s tokens`}
                        className="h-1.5 w-full"
                        parts={tokenParts(turn.tokens)}
                      />
                    </span>
                  )}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {costed
                    ? turn.cost === null
                      ? '–'
                      : dollars(turn.cost)
                    : turn.tokens === null
                      ? '–'
                      : tokens(totalOf(turn.tokens))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Part>
  );
}
