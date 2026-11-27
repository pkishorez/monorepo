import type { ReactNode } from 'react';
import { EyeIcon } from 'lucide-react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import {
  boardOf,
  previewShown,
  stepAt,
  timelineOf,
  traceOf,
} from '../logic/shared/index.ts';
import type { InspectorShape } from '../logic/shared/index.ts';
import { Board } from './board.tsx';
import { Fork, Settings, Ways } from './controls.tsx';
import { Timeline } from './timeline.tsx';

type BodyProps = ViewPropsOf<typeof InspectorShape> & {
  readonly instance: ReactNode;
  readonly world: ReactNode;
  readonly fakes: boolean;
};

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
  const { model, send, instance, world, fakes } = self;
  const board = boardOf(self);
  const timeline = timelineOf(self);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col @3xl:flex-row">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {board ? (
            <Board
              board={board}
              trace={traceOf(self)}
              onOpen={(address) => send({ _tag: 'Opened', address })}
              onStep={(step) => send({ _tag: 'Picked', step })}
            />
          ) : model.problem ? (
            <p className="p-6 text-sm text-muted-foreground">{model.problem}</p>
          ) : (
            <Waiting />
          )}
          {(model.problem !== null && board) || previewShown(self) ? (
            <p
              role="status"
              className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1 font-mono text-xs text-muted-foreground shadow-[0_0_0_1px_var(--color-edge)]"
            >
              {model.problem ?? (
                <>
                  <EyeIcon aria-hidden className="size-3.5 text-running" />
                  The app shows this Step
                </>
              )}
            </p>
          ) : null}
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
                  <Fork onFork={() => send({ _tag: 'Forked' })} />
                )}
                <Settings
                  previewing={model.previewing}
                  removed={model.removed}
                  compared={model.compared}
                  onPreview={(on) => send({ _tag: 'Previewed', on })}
                  onRemoved={(removed) => send({ _tag: 'Toggled', removed })}
                  onCompared={(on) => send({ _tag: 'Compared', on })}
                />
              </>
            }
          />
        )}
        {instance}
      </div>
      {fakes && (
        <aside
          aria-label="World"
          className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border/50 bg-background @3xl:max-h-none @3xl:w-80 @3xl:border-t-0 @3xl:border-l"
        >
          <h2 className="shrink-0 px-4 pt-3 pb-0.5 text-xs font-medium text-muted-foreground">
            World
          </h2>
          {world}
        </aside>
      )}
    </div>
  );
}
