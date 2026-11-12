import { useEffect, useId, useRef } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Moment, Step, Trail as Told } from '../../../../api/index.ts';

/*
 * One Instance zoomed in on: its Trail, oldest first, one row per moment,
 * in the canvas's colours: green when it started, amber when it changed,
 * grey when it only received a Message, red when it stopped. Each row
 * says the Message and who it was for, the State it moved between and the
 * Model and Props paths it changed. A row pressed shows the app at that
 * moment, zoomed back out; the button above goes back out as it was. The
 * card that zoomed in is gone from the page, so its title takes the focus.
 */

const KIND: Record<
  Moment['kind'],
  { readonly text: string; readonly tone: string }
> = {
  started: { text: 'started', tone: 'bg-added/10 text-added' },
  changed: { text: 'changed', tone: 'bg-changed/10 text-changed' },
  received: {
    text: 'received',
    tone: 'border border-border text-muted-foreground',
  },
  stopped: { text: 'stopped', tone: 'bg-removed/10 text-removed' },
};

/** Where a moment is: right after its entry, or init. */
const stepOf = (moment: Moment): Step => moment.entry?.id ?? 'init';

/** What picking a moment asks: its Step, and its Instance's card open, unless the moment stopped it. */
export const pickOf = (moment: Moment) => ({
  step: stepOf(moment),
  open: moment.kind !== 'stopped',
});

/** What the moment was, in a few words: its Message and who it was for, or init. */
const whatOf = (moment: Moment, instance: string) => {
  const { entry } = moment;
  if (!entry) return 'init';
  const to = entry.to === instance ? '' : ` → ${entry.to.split('/').at(-1)}`;
  return `${entry.tag}${to}`;
};

/** What it changed: the State it moved between, and the paths in its Model and Props. */
const changedOf = (moment: Moment) =>
  [
    moment.state ? `${moment.state[0]} → ${moment.state[1]}` : undefined,
    moment.model.length > 0 ? `model ${moment.model.join(', ')}` : undefined,
    moment.props.length > 0 ? `props ${moment.props.join(', ')}` : undefined,
  ].filter((one) => one !== undefined);

export function Trail({
  instance,
  trail,
  problem,
  at,
  onPick,
  onClose,
}: {
  /** The Address zoomed in on. */
  readonly instance: string;
  /** Its Trail, once read. */
  readonly trail: Told | null;
  readonly problem: string | null;
  /** The Step shown; null live. */
  readonly at: Step | null;
  readonly onPick: (moment: Moment) => void;
  readonly onClose: () => void;
}) {
  const title = instance.split('/').at(-1) ?? instance;
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section aria-labelledby={id} className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Back to the whole tree"
          className="h-8 gap-1.5 touch:h-11"
        >
          <ArrowLeftIcon aria-hidden className="size-3.5" />
          <span className="hidden @md:inline">Whole tree</span>
        </Button>
        <h2
          id={id}
          ref={heading}
          tabIndex={-1}
          className="flex min-w-0 items-baseline gap-2 text-sm outline-none"
        >
          <span className="text-muted-foreground">Trail of</span>
          <span className="truncate font-mono font-medium" title={instance}>
            {title}
          </span>
          {trail && trail.actor !== title && (
            <span className="truncate text-xs text-muted-foreground">
              {trail.actor}
            </span>
          )}
        </h2>
      </header>
      {problem ? (
        <p className="p-6 text-sm text-muted-foreground">{problem}</p>
      ) : !trail ? (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          Reading its Trail…
        </p>
      ) : trail.moments.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          No Instance had this Address on the Head's Branch.
        </p>
      ) : (
        <ol
          aria-label={`Moments of ${title}, oldest first`}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        >
          {trail.moments.map((moment) => {
            const step = stepOf(moment);
            const kind = KIND[moment.kind];
            const changed = changedOf(moment);
            const shown = at === step;
            return (
              <li key={`${step}:${moment.kind}`}>
                <button
                  type="button"
                  onClick={() => onPick(moment)}
                  aria-current={shown ? 'step' : undefined}
                  className={cn(
                    'grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:py-3',
                    shown && 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-5 w-fit items-center rounded px-1.5 font-mono text-[11px] font-medium',
                      kind.tone,
                    )}
                  >
                    {kind.text}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs">
                    {whatOf(moment, instance)}
                    {moment.entry && moment.entry.outcome !== 'handled' && (
                      <span className="text-muted-foreground">
                        {moment.entry.outcome === 'ignored'
                          ? ' · no rule took it'
                          : ' · its Instance was gone'}
                      </span>
                    )}
                  </span>
                  <span className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                    {moment.entry
                      ? `#${moment.entry.id} · ${moment.entry.at} ms`
                      : 'init'}
                  </span>
                  {changed.length > 0 && (
                    <span className="col-start-2 col-end-4 truncate font-mono text-[11px] text-muted-foreground">
                      {changed.join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="shrink-0 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
        Pick a moment to see the whole app at that Step.
      </p>
    </section>
  );
}
