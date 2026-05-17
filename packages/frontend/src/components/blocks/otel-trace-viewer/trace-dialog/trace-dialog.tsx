import { useState } from 'react';

import { XIcon } from 'lucide-react';

import { cn } from '#lib/utils';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { StatusDot } from '../status';
import type { OtelSpan } from '../types';
import { formatDuration, type TraceGroup } from '../utils';
import { Gantt } from './gantt';
import { SpanDetail } from './span-detail';

interface TraceDialogProps {
  trace: TraceGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TraceDialog({ trace, open, onOpenChange }: TraceDialogProps) {
  const [selectedSpan, setSelectedSpan] = useState<OtelSpan | null>(null);

  function handleSpanClick(span: OtelSpan) {
    setSelectedSpan((prev) => (prev?.spanId === span.spanId ? null : span));
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) setSelectedSpan(null);
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>{trace?.name ?? 'Trace'}</DialogTitle>
        <DialogDescription>
          Gantt timeline view of trace spans
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        showCloseButton={false}
        className="flex h-[600px] w-[95vw] sm:max-w-[95vw] flex-col gap-0 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          {trace && <StatusDot status={trace.status} />}
          <span className="flex-1 truncate font-mono text-sm font-medium">
            {trace?.name ?? ''}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {trace?.spanCount} span{trace?.spanCount !== 1 ? 's' : ''} ·{' '}
            {formatDuration(trace?.duration ?? null)}
          </span>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-2 shrink-0"
              />
            }
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        {/* Body: gantt + sidebar, fixed height, gantt scrolls */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {trace && (
            <>
              <div className="min-w-0 flex-1 overflow-y-auto">
                <Gantt
                  trace={trace}
                  selectedSpanId={selectedSpan?.spanId ?? null}
                  onSpanClick={handleSpanClick}
                />
              </div>

              {/* Sidebar: width-animated, never shifts dialog height */}
              <div
                className={cn(
                  'shrink-0 overflow-hidden border-l border-border',
                  'transition-[width] duration-200 ease-out',
                  selectedSpan ? 'w-[360px]' : 'w-0',
                )}
              >
                {selectedSpan && (
                  <div className="h-full overflow-y-auto">
                    <SpanDetail
                      span={selectedSpan}
                      onClose={() => setSelectedSpan(null)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
