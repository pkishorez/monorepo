import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Plan } from '@kestack/devtools-kabuki/devtools';
import { chipOf, skeletonOf, slotOf } from '../logic/shared/index.js';
import type { Lit, Mode } from '../logic/shared/index.js';
import { Ask } from './ask.js';
import { Levels } from './levels.js';

const pressed = (run: () => void) => (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  run();
};

function Name({
  plan,
  live,
  dim,
  children,
}: {
  readonly plan: Plan;
  readonly live: boolean;
  readonly dim: boolean;
  readonly children?: ReactNode;
}) {
  const slot = slotOf(plan);
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span
        className={cn(
          'min-w-0 truncate text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none',
          dim ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {plan.actor}
      </span>
      {slot !== null && (
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/80">
          {slot}
        </span>
      )}
      {live && (
        <span
          title="An Instance of it is live now"
          className="size-1.5 shrink-0 self-center rounded-full bg-added"
        >
          <span className="sr-only">Live</span>
        </span>
      )}
      {children}
    </div>
  );
}

export function Card({
  plan,
  live,
  lit,
  mode,
  focused,
  onExplore,
  onToggle,
  onFold,
  onAsk,
}: {
  readonly plan: Plan;
  readonly live: boolean;
  readonly lit: Lit | null;
  readonly mode: Mode;
  readonly focused: boolean;
  readonly onExplore: () => void;
  readonly onToggle: (ref: string) => void;
  readonly onFold: (state: string) => void;
  readonly onAsk: (chip: string) => void;
}) {
  const free = mode === 'explore';

  if (!free && lit === null)
    return (
      <article
        role="button"
        tabIndex={0}
        aria-label={`Explore ${plan.actor} by hand`}
        onClick={onExplore}
        onKeyDown={pressed(onExplore)}
        className="flex cursor-pointer flex-col rounded-lg border border-border/80 bg-background/70 px-3 py-2 transition-[border-color,background-color] duration-200 ease-out outline-none hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <Name plan={plan} live={live} dim />
      </article>
    );

  const skeleton = skeletonOf(plan, lit);
  const dim = (lit?.refs.size ?? 0) > 0;
  const { description } = skeleton;

  return (
    <article
      {...(free
        ? {}
        : {
            role: 'button',
            tabIndex: 0,
            title: 'Explore this card by hand',
            onClick: onExplore,
            onKeyDown: pressed(onExplore),
          })}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card text-[12.5px] leading-5 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_2px_8px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none',
        !free &&
          'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
        focused
          ? 'border-running/70 shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-running)_14%,transparent),0_2px_8px_rgb(0_0_0/0.06)]'
          : 'border-border',
      )}
    >
      <header className="group/ask flex flex-col gap-0.5 px-3 pt-2.5 pb-2">
        <Name plan={plan} live={live} dim={false}>
          {free && (
            <Ask
              label={plan.actor}
              onAsk={() => onAsk(chipOf(plan.path))}
              className="ml-auto self-center"
            />
          )}
        </Name>
        {description !== null && (
          <p
            className={cn(
              '-mx-1 rounded-sm px-1 text-xs text-pretty text-muted-foreground transition-[opacity,background-color] duration-150 ease-out motion-reduce:transition-none',
              description.lit
                ? 'bg-running/10 text-foreground/85'
                : dim && 'opacity-40',
            )}
          >
            {description.text}
          </p>
        )}
        {plan.repeats !== undefined && (
          <p className="text-xs text-muted-foreground">
            Repeats <span className="font-mono">{plan.repeats}</span>
          </p>
        )}
      </header>
      <Levels
        skeleton={skeleton}
        free={free}
        dim={dim}
        onToggle={onToggle}
        onFold={onFold}
        onAsk={(ref) => onAsk(chipOf(plan.path, ref))}
      />
    </article>
  );
}
