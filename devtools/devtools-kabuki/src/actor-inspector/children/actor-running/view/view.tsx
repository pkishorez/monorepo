import type { ReactNode } from 'react';
import { GitBranchIcon } from 'lucide-react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Canvas } from '../../../view/shared/index.ts';
import {
  bringOf,
  cardsOf,
  openedOf,
  stepAt,
  timelineOf,
} from '../logic/shared/index.ts';
import type { Next, RunningShape } from '../logic/shared/index.ts';
import { Timeline } from './timeline.tsx';

type BodyProps = ViewPropsOf<typeof RunningShape> & {
  readonly instances: ReadonlyMap<string, ReactNode>;
};

const PILL =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11';

function Ways({
  next,
  onPick,
}: {
  readonly next: ReadonlyArray<Next>;
  readonly onPick: (id: number) => void;
}) {
  if (next.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Where it goes on from this Step"
      className="flex min-w-0 items-center gap-1"
    >
      {next.map((one) => (
        <button
          key={one.id}
          type="button"
          aria-pressed={one.on}
          title={`#${one.id} ${one.label}`}
          onClick={() => onPick(one.id)}
          className={cn(
            PILL,
            'max-w-40',
            one.on
              ? 'border-foreground/20 bg-muted font-medium text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="truncate">
            #{one.id} {one.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function Waiting() {
  return (
    <p
      role="status"
      className="m-auto flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
      Waiting for the app to answer…
    </p>
  );
}

export function Body(self: BodyProps) {
  const { model, send, instances } = self;
  const root = cardsOf(self);
  if (!root)
    return model.problem ? (
      <p className="p-6 text-sm text-muted-foreground">{model.problem}</p>
    ) : (
      <Waiting />
    );
  const timeline = timelineOf(self);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Canvas
          root={root}
          opened={openedOf(self)}
          bodies={instances}
          follow={model.presenting}
          bring={bringOf(self)}
          onOpen={(id, open) => send({ _tag: 'Opened', id, open })}
        />
        {model.problem && (
          <p
            role="status"
            className="pointer-events-none absolute top-3 left-3 rounded-md border border-border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
          >
            {model.problem}
          </p>
        )}
      </div>
      {!model.presenting && (
        <Timeline
          ticks={timeline.ticks}
          at={timeline.at}
          onAt={(at) => send({ _tag: 'Picked', step: stepAt(self, at) })}
          playing={model.playing}
          onPlaying={(playing) => {
            if (playing !== model.playing) send({ _tag: 'Played', playing });
          }}
          running={timeline.running}
          place={timeline.place}
          extra={
            <>
              <Ways
                next={timeline.next}
                onPick={(id) => send({ _tag: 'Branched', id })}
              />
              {timeline.at !== null && (
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
            </>
          }
        />
      )}
    </div>
  );
}
