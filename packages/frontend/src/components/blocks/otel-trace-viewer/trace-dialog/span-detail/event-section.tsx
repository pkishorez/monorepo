import { useState } from 'react';

import { ChevronRightIcon } from 'lucide-react';

import { cn } from '#lib/utils';

import type { OtelEvent } from '../../types';
import { formatDuration } from '../../utils';
import { AttributeSection } from './attribute-section';

interface EventRowProps {
  event: OtelEvent;
  spanStart: number;
}

function EventRow({ event, spanStart }: EventRowProps) {
  const [open, setOpen] = useState(false);
  const hasAttrs = Object.keys(event.attributes).length > 0;
  const relativeMs = event.timestamp - spanStart;

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => hasAttrs && setOpen((o) => !o)}
        disabled={!hasAttrs}
        className={cn(
          'flex items-center gap-2 text-left text-xs',
          hasAttrs
            ? 'cursor-pointer text-foreground/80 hover:text-foreground'
            : 'cursor-default text-foreground/60',
        )}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="flex-1 truncate font-mono">{event.name}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
          +{formatDuration(relativeMs)}
        </span>
        {hasAttrs && (
          <ChevronRightIcon
            className={cn(
              'size-3 shrink-0 text-muted-foreground/40 transition-transform',
              open && 'rotate-90',
            )}
          />
        )}
      </button>
      {open && hasAttrs && (
        <div className="ml-3.5 rounded-md bg-muted/30 px-2 py-1.5">
          <AttributeSection attributes={event.attributes} />
        </div>
      )}
    </div>
  );
}

interface EventSectionProps {
  events: OtelEvent[];
  spanStart: number;
}

export function EventSection({ events, spanStart }: EventSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      {events.map((event, i) => (
        <EventRow key={i} event={event} spanStart={spanStart} />
      ))}
    </div>
  );
}
