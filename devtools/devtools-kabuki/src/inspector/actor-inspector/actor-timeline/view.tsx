import type { ReactNode } from 'react';
import { GitBranchIcon } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { TimelineLive } from './actor.ts';
import { Timeline } from './ui/timeline.tsx';

/*
 * The Timeline drawn: its track and controls; beside them, where the
 * History goes on from the Step shown in more than one way, each entry
 * that follows it, the one on the Branch in view pressed; Fork, while
 * Travel the app is on and a past Step is shown; and the Travel the app
 * switch.
 */

const PILL =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11';

/** A quiet switch beside the timeline: what more the Inspector does. */
function Switch({
  on,
  onChange,
  name,
  children,
}: {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  /** What it is called whatever its width shows. */
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      onClick={() => onChange(!on)}
      className={cn(
        PILL,
        on
          ? 'border-foreground/20 bg-muted font-medium text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export const TimelineView = View.make(
  TimelineLive,
  ({ model, props, send }) => {
    const scrubbing = props.at !== null;
    return (
      <Timeline
        ticks={props.ticks.map((tick) => ({ ...tick, id: String(tick.id) }))}
        at={props.at}
        onAt={(at) => send({ _tag: 'Picked', at })}
        playing={model.playing}
        onPlaying={(playing) => {
          if (playing !== model.playing) send({ _tag: 'Played', playing });
        }}
        head={{ shown: !scrubbing, running: props.running }}
        place={props.place}
        extra={
          <>
            {props.next.length > 0 && (
              <div
                role="group"
                aria-label="Where it goes on from this Step"
                className="flex min-w-0 items-center gap-1"
              >
                {props.next.map((next) => (
                  <button
                    key={next.id}
                    type="button"
                    aria-pressed={next.on}
                    title={`#${next.id} ${next.label}`}
                    onClick={() => send({ _tag: 'Branched', id: next.id })}
                    className={cn(
                      PILL,
                      'max-w-40',
                      next.on
                        ? 'border-foreground/20 bg-muted font-medium text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="truncate">
                      #{next.id} {next.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {props.travel && scrubbing && (
              <button
                type="button"
                title="Move the app's Head to this Step: the next Message grows a new Branch"
                onClick={() => send({ _tag: 'Forked' })}
                className={cn(
                  PILL,
                  'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <GitBranchIcon aria-hidden className="size-3.5" />
                Fork
              </button>
            )}
            <Switch
              name="Travel the app"
              on={props.travel}
              onChange={(travel) => send({ _tag: 'Travelled', travel })}
            >
              <span className="@xl:hidden">Travel</span>
              <span className="hidden @xl:inline">Travel the app</span>
            </Switch>
          </>
        }
      />
    );
  },
);
