import type { ReactNode } from 'react';
import { GitBranchIcon } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { TimelineLive } from './actor.ts';
import { Timeline } from './ui/timeline.tsx';

/*
 * The Timeline drawn: its track and controls, and beside them Fork, while
 * Travel the app is on and a past Step is shown, and the Travel the app
 * switch.
 */

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
        'h-8 shrink-0 rounded-full border px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11',
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
        live={{ shown: !scrubbing }}
        place={props.place}
        extra={
          <>
            {props.travel && scrubbing && (
              <button
                type="button"
                title="Carry on from this Step, on a new Branch"
                onClick={() => send({ _tag: 'Forked' })}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11"
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
