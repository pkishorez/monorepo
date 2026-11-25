import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { LotelShape } from '../logic/shared/index.js';
import { ClearTelemetry } from './clear-telemetry.js';

const LIST_WIDTH = { initial: 360, min: 280, max: 560 };

type BodyProps = ViewPropsOf<typeof LotelShape> & {
  readonly count: number | undefined;
  readonly feed: ReactNode;
  readonly trace: ReactNode;
};

export function Body({ root, model, send, count, feed, trace }: BodyProps) {
  const [listWidth, setListWidth] = useState(LIST_WIDTH.initial);
  const detailOpen = trace !== null;

  const onListDividerMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = listWidth;
      const move = (next: MouseEvent) =>
        setListWidth(
          Math.min(
            LIST_WIDTH.max,
            Math.max(LIST_WIDTH.min, startWidth + next.clientX - startX),
          ),
        );
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },
    [listWidth],
  );

  return (
    <div {...root} className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:gap-3 sm:px-4">
        <span className="text-xs text-muted-foreground">
          {`${count} trace${count === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto">
          <ClearTelemetry
            clearing={model.clearing}
            onAsk={() => send({ _tag: 'ClearAsked' })}
            onDismiss={() => send({ _tag: 'ClearDismissed' })}
            onConfirm={() => send({ _tag: 'ClearConfirmed' })}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          style={{ width: listWidth }}
          className={cn(
            'flex shrink-0 flex-col overflow-hidden bg-muted/10 max-md:!w-full',
            detailOpen && 'max-md:hidden',
          )}
        >
          {feed}
        </aside>

        <div
          className="hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/30 md:block"
          onMouseDown={onListDividerMouseDown}
        />

        <main
          className={cn(
            'min-w-0 flex-1 overflow-hidden',
            detailOpen ? 'max-md:block' : 'max-md:hidden',
          )}
        >
          {detailOpen ? trace : <WorkbenchEmpty />}
        </main>
      </div>
    </div>
  );
}

function WorkbenchEmpty() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <p className="text-sm font-medium">Select a Trace</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a recent trace from the list to inspect it.
        </p>
      </div>
    </div>
  );
}
