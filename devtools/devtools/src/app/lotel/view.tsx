import { useCallback, useState } from 'react';
import { View, useChild } from '@kestack/kabuki/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { LotelLive } from './actor.js';
import { FeedView, tracesListed } from './feed/index.js';
import { TraceView } from './trace/index.js';
import { ClearTelemetry } from './ui/clear-telemetry';

/*
 * The Lotel Tool drawn: how many Traces the Feed lists and clearing all
 * telemetry along the top; the Feed down the left, as wide as it is
 * dragged; and the Trace open beside it. On a narrow screen only one of
 * the two shows: the Trace while one is open, the Feed otherwise.
 */

const LIST_WIDTH = { initial: 360, min: 280, max: 560 };

export const LotelView = View.make(
  LotelLive,
  ({ root, model, children, send }) => {
    const listed = useChild(
      children.feed,
      (feed) => tracesListed(feed.model).length,
    );
    const [listWidth, setListWidth] = useState(LIST_WIDTH.initial);
    const detailOpen = children.trace !== undefined;

    // Dragging the divider only lays the page out: nothing to remember.
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
            {`${listed} trace${listed === 1 ? '' : 's'}`}
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
            <FeedView instance={children.feed} />
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
            {children.trace ? (
              <TraceView
                key={children.trace.address}
                instance={children.trace}
              />
            ) : (
              <WorkbenchEmpty />
            )}
          </main>
        </div>
      </div>
    );
  },
);

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
